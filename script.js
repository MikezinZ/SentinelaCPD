document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicialização do Gráfico de Telemetria (Chart.js no Tema Claro)
    const ctx = document.getElementById('telemetriaChart');

    if (ctx) {
        new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: ['00:05:00', '00:05:15', '00:05:25', '00:05:30 (Ligou)', '00:05:35', '00:05:50', '00:06:05', '00:06:15'],
                datasets: [
                    {
                        label: 'Temperatura (°C)',
                        data: [24.3, 24.3, 24.3, 24.3, 24.3, 24.3, 24.2, 24.2],
                        borderColor: '#0284c7', // Azul Céu Técnico
                        backgroundColor: 'rgba(2, 132, 199, 0.08)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Corrente AC (A) - Carga Ativa',
                        data: [0.01, 0.01, 0.01, 0.03, 0.08, 0.08, 0.08, 0.08],
                        borderColor: '#059669', // Verde Esmeralda
                        backgroundColor: 'rgba(5, 150, 105, 0.08)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#0f172a',
                            font: {
                                size: 12,
                                weight: '600'
                            },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: '#ffffff',
                        titleColor: '#0f172a',
                        bodyColor: '#334155',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        usePointStyle: true
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#f1f5f9'
                        },
                        ticks: {
                            color: '#64748b',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        min: 20,
                        max: 30,
                        grid: {
                            color: '#e2e8f0'
                        },
                        ticks: {
                            color: '#0284c7',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: 'Temperatura (°C)',
                            color: '#0284c7',
                            font: { size: 11, weight: '600' }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 0,
                        max: 0.15,
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            color: '#059669',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: 'Corrente RMS (A)',
                            color: '#059669',
                            font: { size: 11, weight: '600' }
                        }
                    }
                }
            }
        });
    }

    // 2. Destaque Automático do Link do Menu ao Rolar a Página
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-link');

    window.addEventListener('scroll', () => {
        let current = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            if (pageYOffset >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
});