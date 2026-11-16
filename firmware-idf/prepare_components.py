"""Obter bibliotecas Arduino usadas pelo perfil IDF. Execute antes de idf.py build."""
import pathlib, subprocess
root=pathlib.Path(__file__).resolve().parent/'components'
for name,url,tag,source,include in [
 ('PubSubClient','https://github.com/knolleary/pubsubclient.git','v2.8','src/PubSubClient.cpp','src'),
 ('DHT','https://github.com/adafruit/DHT-sensor-library.git','1.4.6','DHT.cpp','.')]:
    dest=root/name;dest.mkdir(parents=True,exist_ok=True)
    if not (dest/'upstream').exists():
        subprocess.run(['git','clone','--depth','1','--branch',tag,url,str(dest/'upstream')],check=True)
    (dest/'CMakeLists.txt').write_text(f'idf_component_register(SRCS "upstream/{source}" INCLUDE_DIRS "upstream/{include}" REQUIRES arduino-esp32)\n')
