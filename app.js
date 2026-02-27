/*
 * Dashboard Turismo - Jalisco (Versión Mejorada)
 * Script principal para la gestión del mapa interactivo con carga dinámica desde Google Sheets
 * 
 * Funcionalidades:
 * - Carga dinámica de datos desde Google Sheets (CSV)
 * - Renderizado de municipios desde GeoJSON
 * - Interactividad: hover transparente y click para mostrar información
 * - Pop-ups mejorados con información turística sin truncamiento
 * - Links con texto descriptivo (no URLs visibles)
 * - Actualización manual de datos
 */

// ============================================
// VARIABLES GLOBALES
// ============================================

let map;
let geojsonLayer;
let turismoDatos = {};
let currentActiveFeature = null;
let pueblosMagicosMarkers = [];
let dataManager;
let currentLanguage = 'es'; // 'es' para Español, 'en' para Inglés
let turismoDatosEnglish = {}; // Almacenar datos en inglés desde columna I

// Colores y estilos
const STYLES = {
    default: {
        color: '#666',
        weight: 2,
        opacity: 0.7,
        fillColor: '#d0d0d0',
        fillOpacity: 0.7
    },
    hover: {
        color: '#2a5298',
        weight: 2.5,
        opacity: 1,
        fillColor: '#2a5298',
        fillOpacity: 0.3
    },
    active: {
        color: '#1e3c72',
        weight: 3,
        opacity: 1,
        fillColor: '#2a5298',
        fillOpacity: 0.5
    }
};

// ============================================
// CLASE GESTOR DE DATOS DESDE GOOGLE SHEETS
// ============================================

class TurismoDataManager {
    constructor() {
        // URL de exportación CSV del Google Sheet
        // ID del sheet: 1x8jI4RYM6nvhydMfxBn68x7shxyEuf_KWNC0iDq8mzw
        // gid: 0 (primera hoja)
        this.googleSheetsUrl = 'https://docs.google.com/spreadsheets/d/1x8jI4RYM6nvhydMfxBn68x7shxyEuf_KWNC0iDq8mzw/export?format=csv&gid=0';
        this.updateInterval = 5000; // 5 segundos
        this.lastDataHash = null;
        this.isUpdating = false;
        this.statusElement = null;
        this.createStatusIndicator();
        this.startAutoUpdate();
    }

    createStatusIndicator() {
        // Crear indicador de estado en el header
        const headerContent = document.querySelector('.header-content');
        if (headerContent) {
            this.statusElement = document.querySelector('.status-indicator');
        }
    }

    updateStatus(icon, text) {
        const statusIcon = document.getElementById('status-icon');
        const statusText = document.getElementById('status-text');
        if (statusIcon) statusIcon.textContent = icon;
        if (statusText) statusText.textContent = text;
    }

    startAutoUpdate() {
        // Actualizar datos automáticamente
        setInterval(() => {
            this.updateData();
        }, this.updateInterval);

        // Botón de actualización manual
        const manualUpdateBtn = document.getElementById('manual-update');
        if (manualUpdateBtn) {
            manualUpdateBtn.addEventListener('click', () => {
                this.updateData(true);
            });
        }
    }

    async updateData(manual = false) {
        if (this.isUpdating) return;
        
        this.isUpdating = true;
        if (manual) {
            this.updateStatus('🔄', 'Actualizando datos...');
        }

        try {
            const newData = await this.fetchDataFromGoogleSheets();
            const newHash = JSON.stringify(newData).split('').reduce((a, b) => {
                a = ((a << 5) - a) + b.charCodeAt(0);
                return a & a;
            }, 0);

            if (newHash !== this.lastDataHash || manual) {
                turismoDatos = {};
                newData.forEach(pueblo => {
                    turismoDatos[pueblo.nombre] = pueblo;
                });
                this.lastDataHash = newHash;
                
                // Actualizar marcadores en el mapa
                if (typeof updatePueblosMagicosMarkers === 'function') {
                    updatePueblosMagicosMarkers();
                }
                
                this.updateStatus('🟢', 'Datos actualizados');
                console.log('✓ Datos actualizados desde Google Sheets:', Object.keys(turismoDatos).length, 'pueblos');
            } else {
                this.updateStatus('🟢', 'Sin cambios');
            }
        } catch (error) {
            console.error('Error actualizando datos:', error);
            this.updateStatus('❌', 'Error de conexión');
        }

        this.isUpdating = false;
    }

    async fetchDataFromGoogleSheets() {
        try {
            const response = await fetch(this.googleSheetsUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const csvText = await response.text();
            return this.parseCSVData(csvText);
        } catch (error) {
            console.error('Error fetching data from Google Sheets:', error);
            throw error;
        }
    }

    parseCSVData(csvText) {
        const data = [];
        
        // Usar un parseador robusto para CSV con campos multilinea
        const rows = this.parseCSVText(csvText);
        
        if (rows.length < 2) return data;
        
        const headers = rows[0].map(h => h.trim().toLowerCase());
        
        console.log('📋 Headers detectados:', headers);
        
        // Detectar índices de columnas por posición
        let latitudIndex = 2;      // Columna C
        let longitudIndex = 3;     // Columna D
        let nombreIndex = 1;       // Columna B
        let seguridadIndex = 4;    // Columna E
        let distanciaIndex = 5;    // Columna F
        let rutaIndex = 6;         // Columna G
        let linkTurismoIndex = 7;  // Columna H
        let securityTipsIndex = 8; // Columna I (Security Tips en Inglés)
        
        console.log('✅ Índices de columnas detectados:', {
            nombre: nombreIndex + ' (' + (nombreIndex >= 0 && nombreIndex < headers.length ? headers[nombreIndex] : 'N/A') + ')',
            latitud: latitudIndex + ' (' + (latitudIndex >= 0 && latitudIndex < headers.length ? headers[latitudIndex] : 'N/A') + ')',
            longitud: longitudIndex + ' (' + (longitudIndex >= 0 && longitudIndex < headers.length ? headers[longitudIndex] : 'N/A') + ')',
            seguridad: seguridadIndex + ' (' + (seguridadIndex >= 0 && seguridadIndex < headers.length ? headers[seguridadIndex] : 'N/A') + ')',
            distancia: distanciaIndex + ' (' + (distanciaIndex >= 0 && distanciaIndex < headers.length ? headers[distanciaIndex] : 'N/A') + ')',
            ruta: rutaIndex + ' (' + (rutaIndex >= 0 && rutaIndex < headers.length ? headers[rutaIndex] : 'N/A') + ')',
            linkTurismo: linkTurismoIndex + ' (' + (linkTurismoIndex >= 0 && linkTurismoIndex < headers.length ? headers[linkTurismoIndex] : 'N/A') + ')',
            securityTips: securityTipsIndex + ' (' + (securityTipsIndex >= 0 && securityTipsIndex < headers.length ? headers[securityTipsIndex] : 'N/A') + ')'
        });
        
        // Procesar filas de datos
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            
            try {
                // Extraer datos usando índices detectados
                const nombre = nombreIndex >= 0 && nombreIndex < row.length ? row[nombreIndex].trim() : '';
                const latitudStr = latitudIndex >= 0 && latitudIndex < row.length ? row[latitudIndex].trim() : '';
                const longitudStr = longitudIndex >= 0 && longitudIndex < row.length ? row[longitudIndex].trim() : '';
                const seguridad = seguridadIndex >= 0 && seguridadIndex < row.length ? row[seguridadIndex].trim() : '';
                const distancia = distanciaIndex >= 0 && distanciaIndex < row.length ? row[distanciaIndex].trim() : '';
                const ruta = rutaIndex >= 0 && rutaIndex < row.length ? row[rutaIndex].trim() : '';
                const linkTurismo = linkTurismoIndex >= 0 && linkTurismoIndex < row.length ? row[linkTurismoIndex].trim() : '';
                const securityTips = securityTipsIndex >= 0 && securityTipsIndex < row.length ? row[securityTipsIndex].trim() : '';
                
                // Validar que tenga nombre y coordenadas
                if (!nombre || !latitudStr || !longitudStr) continue;
                
                // Procesar coordenadas
                let latitud = parseFloat(latitudStr.replace(',', '.'));
                let longitud = parseFloat(longitudStr.replace(',', '.'));
                
                if (isNaN(latitud) || isNaN(longitud)) continue;
                
                const record = {
                    nombre: nombre,
                    latitud: latitud,
                    longitud: longitud,
                    seguridad: seguridad || 'Información no disponible',
                    securityTips: securityTips || 'Information not available',
                    distancia: distancia || 'N/A',
                    ruta: ruta || '#',
                    linkTurismo: linkTurismo || '#'
                };
                
                data.push(record);
                console.log(`✅ Pueblo cargado: ${nombre} [${longitud}, ${latitud}] - Ruta: ${ruta ? 'SÍ' : 'NO'} - Link: ${linkTurismo ? 'SÍ' : 'NO'}`);
                
            } catch (error) {
                console.warn('Error procesando fila:', row, error);
            }
        }
        
        console.log(`📊 Total de pueblos procesados: ${data.length}`);
        return data;
    }

    parseCSVText(csvText) {
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;
        
        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Comilla escapada
                    currentField += '"';
                    i++; // Saltar siguiente comilla
                } else {
                    // Toggle de estado de comillas
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Fin de campo
                currentRow.push(currentField);
                currentField = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                // Fin de fila
                if (currentField || currentRow.length > 0) {
                    currentRow.push(currentField);
                    if (currentRow.some(f => f.length > 0)) {
                        rows.push(currentRow);
                    }
                    currentRow = [];
                    currentField = '';
                }
                // Saltar \r\n
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
            } else {
                currentField += char;
            }
        }
        
        // Agregar último campo y fila
        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField);
            if (currentRow.some(f => f.length > 0)) {
                rows.push(currentRow);
            }
        }
        
        return rows;
    }
}

// ============================================
// INICIALIZACIÓN DEL MAPA
// ============================================

function initMap() {
    // Crear mapa centrado en Jalisco
    map = L.map('map').setView([20.5, -103.5], 8);

    // Agregar capa base de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        minZoom: 7
    }).addTo(map);

    // Inicializar gestor de datos
    dataManager = new TurismoDataManager();
    
    // Cargar datos y mostrar pueblos mágicos
    loadTurismoData();
}

// ============================================
// CARGAR DATOS DE TURISMO DESDE GOOGLE SHEETS
// ============================================

async function loadTurismoData() {
    try {
        const data = await dataManager.fetchDataFromGoogleSheets();
        
        // Convertir array a objeto indexado por nombre
        data.forEach(pueblo => {
            turismoDatos[pueblo.nombre] = pueblo;
        });
        
        console.log('Datos de turismo cargados:', Object.keys(turismoDatos).length, 'pueblos');
        
        // Mostrar pueblos mágicos en el mapa
        updatePueblosMagicosMarkers();
        
        // Cargar GeoJSON
        loadGeoJSON();
        
    } catch (error) {
        console.error('Error cargando datos de turismo:', error);
        // Intentar cargar GeoJSON de todas formas
        loadGeoJSON();
    }
}

// ============================================
// ACTUALIZAR MARCADORES DE PUEBLOS MÁGICOS
// ============================================

function updatePueblosMagicosMarkers() {
    // Limpiar marcadores anteriores
    pueblosMagicosMarkers.forEach(marker => map.removeLayer(marker));
    pueblosMagicosMarkers = [];
    
    // Crear ícono personalizado para Pueblos Mágicos
    const puebloMagicoIcon = L.icon({
        iconUrl: 'pueblo-magico-icon.png',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });

    // Agregar marcador para cada pueblo mágico
    Object.values(turismoDatos).forEach(pueblo => {
        const marker = L.marker([pueblo.latitud, pueblo.longitud], {
            icon: puebloMagicoIcon,
            title: pueblo.nombre,
            zIndexOffset: 1000
        }).addTo(map);

        // Agregar tooltip con el nombre del pueblo
        marker.bindTooltip(pueblo.nombre, {
            permanent: false,
            direction: 'top',
            className: 'pueblo-magico-tooltip'
        });

        // Evento click para mostrar información
        marker.on('click', function() {
            showPuebloInfo(pueblo.nombre);
        });

        pueblosMagicosMarkers.push(marker);
    });
}

// ============================================
// CARGAR GEOJSON DE MUNICIPIOS
// ============================================

function loadGeoJSON() {
    fetch('jalisco_municipios.geojson')
        .then(response => response.json())
        .then(data => {
            geojsonLayer = L.geoJSON(data, {
                style: getFeatureStyle,
                onEachFeature: onEachFeature
            }).addTo(map);

            // Ajustar vista al mapa cargado
            if (geojsonLayer.getLayers().length > 0) {
                map.fitBounds(geojsonLayer.getBounds(), { padding: [50, 50] });
            }
        })
        .catch(error => console.error('Error cargando GeoJSON:', error));
}

// ============================================
// OBTENER ESTILO DE CARACTERÍSTICA
// ============================================

function getFeatureStyle(feature) {
    return STYLES.default;
}

// ============================================
// PROCESAR CADA CARACTERÍSTICA DEL GEOJSON
// ============================================

function onEachFeature(feature, layer) {
    const municipioNombre = feature.properties.NOMGEO;

    // Agregar eventos de mouse
    layer.on('mouseover', function() {
        this.setStyle(STYLES.hover);
        this.bringToFront();
        
        // Mostrar nombre del municipio en tooltip
        this.bindTooltip(municipioNombre, {
            permanent: false,
            direction: 'center',
            className: 'municipio-tooltip'
        }).openTooltip();
    });

    layer.on('mouseout', function() {
        // Restaurar estilo anterior si no está activo
        if (currentActiveFeature !== this) {
            this.setStyle(STYLES.default);
        }
        this.closeTooltip();
    });

    // Evento de click para mostrar información
    layer.on('click', function() {
        // Remover estilo activo del municipio anterior
        if (currentActiveFeature && currentActiveFeature !== this) {
            currentActiveFeature.setStyle(STYLES.default);
        }

        // Establecer nuevo municipio como activo
        currentActiveFeature = this;
        this.setStyle(STYLES.active);

        // Mostrar modal con información
        showPuebloInfo(municipioNombre);
    });
}

// ============================================
// MOSTRAR INFORMACIÓN DEL PUEBLO
// ============================================

function showPuebloInfo(nombrePueblo) {
    // Obtener datos del pueblo desde Google Sheets
    const pueblo = turismoDatos[nombrePueblo] || {
        nombre: nombrePueblo,
        distancia: 'N/A',
        seguridad: 'Información no disponible',
        securityTips: 'Information not available',
        ruta: '#',
        linkTurismo: '#'
    };
    
    // Cargar infografía según idioma
    loadInfografia(nombrePueblo, currentLanguage);

    // Construir contenido del modal
    const modalBody = document.getElementById('modalBody');

    // Seleccionar informacion de seguridad segun idioma
    const infoSeguridad = currentLanguage === 'en' ? pueblo.securityTips : pueblo.seguridad;
    const labelSeguridad = currentLanguage === 'en' ? 'SECURITY TIPS' : 'CONSEJOS DE SEGURIDAD';
    const labelRuta = currentLanguage === 'en' ? 'ROUTE FROM GDL' : 'RUTA DESDE GDL';
    const labelTurismo = currentLanguage === 'en' ? 'TOURISM LINK' : 'LINK TURISMO';
    const labelLlamar = currentLanguage === 'en' ? 'CALL 911' : 'LLAMAR AL 911';
    const labelDesde = currentLanguage === 'en' ? 'FROM GUADALAJARA:' : 'DESDE GUADALAJARA:';

    // Crear secciones de informacion
    let contenido = `
        <h2>${pueblo.nombre}</h2>
        
        <div class="info-section">
            <div class="info-label-inline">📍 ${labelDesde}&nbsp;&nbsp;${pueblo.distancia}</div>
        </div>
    `;

    // Agregar link de ruta si existe
    if (pueblo.ruta && pueblo.ruta !== '#' && pueblo.ruta.length > 0) {
        contenido += `
        <div class="info-section">
            <a href="${pueblo.ruta}" target="_blank" rel="noopener noreferrer" class="info-link-direct">🗺️ ${labelRuta}</a>
        </div>
        `;
    } else {
        contenido += `
        <div class="info-section">
            <span class="info-label-disabled">🗺️ ${labelRuta}</span>
        </div>
        `;
    }

    // Agregar link de turismo si existe
    if (pueblo.linkTurismo && pueblo.linkTurismo !== '#' && pueblo.linkTurismo.length > 0) {
        contenido += `
        <div class="info-section">
            <a href="${pueblo.linkTurismo}" target="_blank" rel="noopener noreferrer" class="info-link-direct">🌍 ${labelTurismo}</a>
        </div>
        `;
    } else {
        contenido += `
        <div class="info-section">
            <span class="info-label-disabled">🌍 ${labelTurismo}</span>
        </div>
        `;
    }

    // Agregar seccion de consejos de seguridad
    contenido += `
        <div class="info-section">
            <div class="info-label">🛡️ ${labelSeguridad}</div>
            <div class="info-value recomendaciones">
                <div class="recomendaciones-text">${infoSeguridad}</div>
            </div>
        </div>

        <div class="info-section">
            <a href="tel:911" class="clicktocall-btn">
                <span class="clicktocall-icon">📞</span>
                ${labelLlamar}
            </a>
        </div>
    `;

    modalBody.innerHTML = contenido;

    // Mostrar modal
    const modal = document.getElementById('infoModal');
    modal.style.display = 'block';
}


// ============================================
// CARGAR INFOGRAFÍA DINÁMICAMENTE
// ============================================

function loadInfografia(nombrePueblo, idioma) {
    // Normalizar nombre del pueblo (eliminar espacios, convertir a minúsculas)
    const nombreNormalizado = nombrePueblo.toLowerCase().replace(/\s+/g, '_');
    
    // Determinar sufijo según idioma
    const sufijo = idioma === 'en' ? 'English' : 'Final';
    
    // Construir nombre del archivo
    const nombreArchivo = `Infografia_Seguridad_${nombrePueblo}_${sufijo}.png`;
    
    // Elementos del DOM
    const infografiaImg = document.getElementById('infografiaImg');
    const infografiaPlaceholder = document.getElementById('infografiaPlaceholder');
    
    // Intentar cargar la infografía
    if (nombrePueblo === 'Tequila') {
        // Para Tequila, usar archivos locales
        infografiaImg.src = nombreArchivo;
        infografiaImg.style.display = 'block';
        infografiaPlaceholder.style.display = 'none';
        
        // Manejar error si la imagen no se carga
        infografiaImg.onerror = function() {
            infografiaImg.style.display = 'none';
            infografiaPlaceholder.style.display = 'flex';
        };
    } else {
        // Para otros pueblos, mostrar placeholder hasta que tengan infografías
        infografiaImg.style.display = 'none';
        infografiaPlaceholder.style.display = 'flex';
    }
}

// ============================================
// CERRAR MODAL
// ============================================

function closeModal() {
    const modal = document.getElementById('infoModal');
    modal.style.display = 'none';

    // Remover estilo activo del municipio
    if (currentActiveFeature) {
        currentActiveFeature.setStyle(STYLES.default);
        currentActiveFeature = null;
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Inicializar mapa cuando el DOM esté listo
    initMap();

    // Cerrar modal al hacer click en el botón X
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    // Cerrar modal al hacer click fuera del contenido
    const modal = document.getElementById('infoModal');
    if (modal) {
        window.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeModal();
            }
        });
    }

    // Cerrar modal al presionar ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeModal();
        }
    });
});

// ============================================
// CAMBIO DE IDIOMA
// ============================================

function getTextos() {
    if (currentLanguage === 'en') {
        return {
            desde: 'FROM GUADALAJARA:',
            ruta: 'ROUTE FROM GDL',
            turismo: 'TOURISM LINK',
            seguridad: 'SECURITY TIPS',
            llamar: 'CALL 911'
        };
    } else {
        return {
            desde: 'DESDE GUADALAJARA:',
            ruta: 'RUTA DESDE GDL',
            turismo: 'LINK TURISMO',
            seguridad: 'CONSEJOS DE SEGURIDAD',
            llamar: 'LLAMAR AL 911'
        };
    }
}

function changeLanguage(lang) {
    currentLanguage = lang;
    
    // Actualizar botones de idioma
    document.getElementById('lang-es').classList.remove('active');
    document.getElementById('lang-en').classList.remove('active');
    
    if (lang === 'es') {
        document.getElementById('lang-es').classList.add('active');
    } else {
        document.getElementById('lang-en').classList.add('active');
    }
    
    // Si hay un modal abierto, actualizar su contenido
    const modal = document.getElementById('infoModal');
    if (modal.style.display === 'block') {
        // Obtener el nombre del pueblo del título del modal
        const titulo = document.querySelector('.modal-body h2');
        if (titulo) {
            showPuebloInfo(titulo.textContent);
        }
    }
    
    console.log('Idioma cambiado a:', lang === 'es' ? 'Español' : 'Inglés');
}

// Agregar event listeners a los botones de idioma
document.addEventListener('DOMContentLoaded', function() {
    const langBtns = document.querySelectorAll('.lang-btn');
    langBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const lang = this.getAttribute('data-lang');
            changeLanguage(lang);
        });
    });
});
