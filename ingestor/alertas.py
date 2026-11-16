"""Motor de alertas da API v2.

Abre e resolve linhas na tabela `alertas` a partir da telemetria, dos eventos de
energia e da ausência de dados. Usa os limites configurados no app (tabela
`limites`), com histerese e número de amostras consecutivas.

Tipos: temperature_high/low, humidity_high/low, current_high, sensor_invalid,
battery_low, power_loss e telemetry_stale.
"""
import time

from schema import LIMITES_PADRAO

BATERIA_BAIXA = 20       # % para abrir battery_low
BATERIA_OK = 25          # % para resolver battery_low

SEVERIDADE = {
    "temperature_high": "critical", "temperature_low": "warning",
    "humidity_high": "warning", "humidity_low": "warning", "current_high": "warning",
    "sensor_invalid": "warning", "battery_low": "warning", "power_loss": "critical",
    "telemetry_stale": "warning",
}


def br(v, casas=1):
    return f"{v:.{casas}f}".replace(".", ",")


class MotorAlertas:
    def __init__(self):
        self._limites = {}          # dispositivo -> (instante, dict)
        self._seguidas = {}         # (dispositivo, tipo) -> amostras consecutivas violando

    # ------------------------------------------------------------- utilidades
    def limites(self, cur, disp):
        cache = self._limites.get(disp)
        if cache and time.time() - cache[0] < 10:
            return cache[1]
        cur.execute("SELECT * FROM limites WHERE dispositivo_id=%s", (disp,))
        linha = cur.fetchone()
        if linha:
            nomes = [c[0] for c in cur.description]
            lim = dict(zip(nomes, linha))
        else:
            lim = dict(LIMITES_PADRAO)
        self._limites[disp] = (time.time(), lim)
        return lim

    @staticmethod
    def abrir(cur, disp, tipo, mensagem, versao=1):
        cur.execute(
            "SELECT id FROM alertas WHERE dispositivo_id=%s AND tipo=%s AND resolvido_em IS NULL LIMIT 1",
            (disp, tipo),
        )
        if cur.fetchone():
            return False
        cur.execute(
            "INSERT INTO alertas (dispositivo_id, tipo, severidade, mensagem, versao_regra, aberto_em) "
            "VALUES (%s,%s,%s,%s,%s,NOW())",
            (disp, tipo, SEVERIDADE[tipo], mensagem[:255], int(versao)),
        )
        print(f"[alerta] ABERTO {disp} {tipo}: {mensagem}")
        return True

    @staticmethod
    def resolver(cur, disp, tipo):
        cur.execute(
            "UPDATE alertas SET resolvido_em=NOW() "
            "WHERE dispositivo_id=%s AND tipo=%s AND resolvido_em IS NULL",
            (disp, tipo),
        )
        if cur.rowcount:
            print(f"[alerta] RESOLVIDO {disp} {tipo}")

    def _regra(self, cur, disp, tipo, violando, normal, mensagem, lim):
        """Abre após N amostras seguidas violando; resolve quando volta à faixa com histerese."""
        chave = (disp, tipo)
        if violando:
            self._seguidas[chave] = self._seguidas.get(chave, 0) + 1
            if self._seguidas[chave] >= max(1, int(lim["consecutive_samples"] or 1)):
                self.abrir(cur, disp, tipo, mensagem, lim.get("versao", 1))
        else:
            self._seguidas[chave] = 0
            if normal:
                self.resolver(cur, disp, tipo)

    # ------------------------------------------------------------- entradas
    def telemetria(self, cur, disp, temp, umid, corr, bat):
        lim = self.limites(cur, disp)
        self.resolver(cur, disp, "telemetry_stale")

        def faixa(tipo_alto, tipo_baixo, v, mn, mx, h, nome, unidade):
            if v is None:
                return
            h = h or 0
            if mx is not None:
                self._regra(cur, disp, tipo_alto, v > mx, v <= mx - h,
                            f"{nome} de {br(v)} {unidade} acima do limite de {br(mx)} {unidade}.", lim)
            if mn is not None:
                self._regra(cur, disp, tipo_baixo, v < mn, v >= mn + h,
                            f"{nome} de {br(v)} {unidade} abaixo do limite de {br(mn)} {unidade}.", lim)

        faixa("temperature_high", "temperature_low", temp, lim["temperature_min"], lim["temperature_max"],
              lim["temperature_hysteresis"], "Temperatura", "°C")
        faixa("humidity_high", "humidity_low", umid, lim["humidity_min"], lim["humidity_max"],
              lim["humidity_hysteresis"], "Umidade", "% UR")
        if corr is not None and lim["current_max"] is not None:
            cmax, ch = lim["current_max"], lim["current_hysteresis"] or 0
            self._regra(cur, disp, "current_high", corr > cmax, corr <= cmax - ch,
                        f"Corrente RMS de {br(corr, 2)} A acima do limite de {br(cmax, 2)} A.", lim)
        sem_dht = temp is None and umid is None
        self._regra(cur, disp, "sensor_invalid", sem_dht, not sem_dht,
                    "Sensor DHT22 sem leitura válida (temperatura e umidade).", lim)
        if bat is not None:
            if bat < BATERIA_BAIXA:
                self.abrir(cur, disp, "battery_low", f"Bateria baixa ({int(bat)}%).", lim.get("versao", 1))
            elif bat >= BATERIA_OK:
                self.resolver(cur, disp, "battery_low")

    def evento(self, cur, disp, tipo):
        if tipo in ("POWER_LOSS", "LAST_GASP"):
            self.abrir(cur, disp, "power_loss",
                       "Queda de energia: dispositivo operando em bateria." if tipo == "POWER_LOSS"
                       else "LAST_GASP recebido: dispositivo perdendo alimentação.")
        elif tipo == "POWER_RESTORED":
            self.resolver(cur, disp, "power_loss")

    def verificar_silencio(self, cur, segundos):
        """Abre telemetry_stale para dispositivos ativos sem dados há mais de `segundos`."""
        cur.execute(
            "SELECT id FROM dispositivos WHERE ativo=1 AND ultimo_contato IS NOT NULL "
            "AND ultimo_contato < NOW() - INTERVAL %s SECOND",
            (int(segundos),),
        )
        for (disp,) in cur.fetchall():
            self.abrir(cur, disp, "telemetry_stale",
                       f"Sem telemetria há mais de {int(segundos)} s.", self.limites(cur, disp).get("versao", 1))
