# WebAgent 🕷️

WebAgent es un servicio inteligente de exploración web que utiliza Playwright e IA para analizar páginas web y proporcionar guías de navegación estructuradas para automatización.

## 🚀 Características

- **Exploración Inteligente**: Analiza páginas web con objetivos específicos
- **Formato Estructurado**: Devuelve análisis en Markdown con selectores CSS ejecutables
- **Navegación Automatizable**: Proporciona rutas paso a paso para scripts automatizados
- **Integración con IA**: Utiliza OpenRouter/OpenAI para análisis contextual
- **Docker Ready**: Completamente containerizado para producción

## 📋 Requisitos

- Docker y Docker Compose
- Node.js 18+ (para desarrollo local)
- Clave de API de OpenRouter o OpenAI

## 🔧 Instalación

### Producción (Docker)

1. **Clonar el repositorio**:
   ```bash
   git clone <url-del-repo>
   cd WebAgent
   ```

2. **Configurar variables de entorno**:
   ```bash
   cp .env.example .env
   # Editar .env con tus claves de API
   ```

3. **Iniciar el servicio**:
   ```bash
   docker compose up -d
   ```

4. **Verificar funcionamiento**:
   ```bash
   curl http://localhost:8787/health
   ```

### Desarrollo Local

1. **Instalar dependencias**:
   ```bash
   npm install
   ```

2. **Configurar entorno**:
   ```bash
   cp .env.example .env
   # Configurar NODE_ENV=development
   ```

3. **Desarrollo**:
   ```bash
   npm run dev
   ```

4. **Producción local**:
   ```bash
   npm run build
   npm start
   ```

## 📖 API Endpoints

### POST /explore/summarize
Explora una página web con un objetivo específico.

**Request:**
```json
{
  "url": "https://example.com",
  "goal": "Necesito buscar 'iniciativas'",
  "maxSteps": 3,
  "screenshot": false
}
```

**Response:**
```json
{
  "summary": "## 📊 Resumen del Sitio\n...",
  "rawResult": {
    "steps": [...],
    "content": {
      "text": "...",
      "links": [...],
      "navElements": [...],
      "searchElements": [...]
    }
  }
}
```

### GET /health
Verificación de salud del servicio.

**Response:**
```json
{
  "ok": true
}
```

## 🎯 Formato de Respuesta

WebAgent devuelve análisis estructurados optimizados para automatización:

- **📊 Resumen del Sitio**: Tipo y función del sitio web
- **🎯 Análisis del Objetivo**: Si encontró el contenido buscado
- **🗺️ Rutas de Navegación**: Pasos específicos para llegar al contenido
- **📋 Enlaces Ejecutables**: URLs específicas con selectores CSS
- **🔍 Selectores CSS**: Para extracción automática
- **🤖 Script de Automatización**: Pseudocódigo ejecutable

## 🔗 Integración con ExtractorW

WebAgent está diseñado para integrarse con ExtractorW como proxy:

```javascript
// Llamada desde frontend a ExtractorW
const response = await fetch('/api/webagent/explore', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://congreso.gob.gt',
    goal: 'Buscar iniciativas legislativas'
  })
});
```

## 🚦 Variables de Entorno

| Variable | Descripción | Requerido | Ejemplo |
|----------|-------------|-----------|---------|
| `PORT` | Puerto del servidor | No | `8787` |
| `NODE_ENV` | Entorno de ejecución | No | `production` |
| `OPENROUTER_API_KEY` | Clave de OpenRouter | Recomendado | `sk-or-...` |
| `OPENROUTER_MODEL` | Modelo de OpenRouter | No | `openrouter/auto` |
| `OPENAI_API_KEY` | Clave de OpenAI (fallback) | Opcional | `sk-...` |
| `OPENAI_MODEL` | Modelo de OpenAI | No | `gpt-4o-mini` |

## 🐳 Docker

### Construcción
```bash
docker build -t webagent .
```

### Ejecución
```bash
docker run -p 8787:8787 \
  --shm-size=2g \
  --cap-add=SYS_ADMIN \
  --security-opt seccomp=unconfined \
  -e OPENROUTER_API_KEY=tu_clave \
  webagent
```

### Docker Compose (Recomendado)
```bash
docker compose up -d
```

## 📊 Ejemplos de Uso

### Análisis de Sitio Gubernamental
```bash
curl -X POST http://localhost:8787/explore/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.congreso.gob.gt/",
    "goal": "Necesito buscar iniciativas legislativas",
    "maxSteps": 4
  }'
```

### Búsqueda en Portal Corporativo
```bash
curl -X POST http://localhost:8787/explore/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://portal.sat.gob.gt/",
    "goal": "Encontrar formularios de declaración",
    "maxSteps": 3
  }'
```

## 🔍 Troubleshooting

### Error: Puerto ya en uso
```bash
# Verificar qué está usando el puerto
lsof -i :8787

# Detener containers existentes
docker stop webagent
```

### Error: Sin respuesta de IA
- Verificar que `OPENROUTER_API_KEY` o `OPENAI_API_KEY` estén configuradas
- Verificar conectividad a internet
- Revisar logs: `docker logs webagent`

### Error: Playwright
- El contenedor requiere `--shm-size=2g` y privilegios especiales
- Verificar que Docker tenga suficiente memoria asignada

## 📈 Performance

- **Tiempo promedio**: 3-8 segundos por análisis
- **Memoria**: ~300MB en reposo, ~800MB durante procesamiento
- **CPU**: Intensivo durante análisis de página
- **Red**: Depende del tamaño de la página analizada

## 🔐 Seguridad

- WebAgent ejecuta JavaScript de páginas web en un entorno aislado
- No almacena contenido de páginas analizadas
- Las claves de API se pasan como variables de entorno
- Recomendado ejecutar en red interna (no exponer puerto públicamente)

## 🛠️ Desarrollo

### Scripts disponibles
- `npm run dev`: Desarrollo con recarga automática
- `npm run build`: Construcción para producción
- `npm start`: Ejecutar versión construida
- `npm test`: Ejecutar tests (próximamente)

### Arquitectura
```
src/server.ts          # Servidor principal Fastify
├── callLLM()          # Integración con APIs de IA
├── runAgent()         # Agente de exploración simple
├── buildPlan()        # Construcción de planes de navegación
├── executePlan()      # Ejecución de planes
└── /explore/summarize # Endpoint principal
```

## 📝 Changelog

### v1.0.0
- ✅ Exploración básica con Playwright
- ✅ Integración con OpenRouter/OpenAI
- ✅ Formato estructurado para automatización
- ✅ Docker y Docker Compose
- ✅ Integración con ExtractorW

## 📄 Licencia

MIT License - ver archivo LICENSE para más detalles.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crear una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Crear un Pull Request

## 📞 Soporte

Para problemas y preguntas:
- Crear un issue en GitHub
- Revisar logs con `docker logs webagent`
- Verificar configuración de variables de entorno
