#!/bin/bash

# WebAgent Deploy Script
# Despliega WebAgent en VPS usando Docker

set -e

echo "🚀 WebAgent Deployment Script"
echo "==============================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Verificar que Docker esté instalado
if ! command -v docker &> /dev/null; then
    error "Docker no está instalado. Instálalo primero."
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    error "Docker Compose no está instalado. Instálalo primero."
fi

# Verificar archivo .env
if [ ! -f .env ]; then
    warn "Archivo .env no encontrado."
    if [ -f .env.example ]; then
        log "Copiando .env.example a .env..."
        cp .env.example .env
        echo -e "${BLUE}📝 Por favor edita el archivo .env con tus configuraciones:${NC}"
        echo "   - OPENROUTER_API_KEY o OPENAI_API_KEY"
        echo "   - NODE_ENV=production"
        echo ""
        read -p "¿Has configurado el archivo .env? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Por favor configura el archivo .env antes de continuar."
        fi
    else
        error "No se encontró .env ni .env.example"
    fi
fi

# Verificar configuración básica en .env
if ! grep -q "NODE_ENV=production" .env; then
    warn "NODE_ENV no está configurado como 'production' en .env"
fi

if ! grep -q "OPENROUTER_API_KEY\|OPENAI_API_KEY" .env; then
    warn "No se encontraron claves de API en .env"
fi

# Detener servicio existente si está corriendo
log "Deteniendo servicios existentes..."
docker compose down 2>/dev/null || true

# Limpiar imágenes antiguas (opcional)
read -p "¿Deseas limpiar imágenes Docker antiguas? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Limpiando imágenes antiguas..."
    docker system prune -f
fi

# Construir nueva imagen
log "Construyendo imagen Docker..."
docker compose build --no-cache

# Iniciar servicios
log "Iniciando WebAgent..."
docker compose up -d

# Esperar que el servicio esté listo
log "Esperando que el servicio esté listo..."
sleep 10

# Verificar salud del servicio
log "Verificando salud del servicio..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:8787/health > /dev/null; then
        log "✅ WebAgent está funcionando correctamente!"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo -n "."
        sleep 2
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    error "❌ WebAgent no responde después de $MAX_RETRIES intentos"
fi

# Mostrar estado final
log "Estado de los contenedores:"
docker compose ps

# Mostrar información útil
echo ""
echo -e "${BLUE}📋 Información de despliegue:${NC}"
echo "   🌐 URL: http://localhost:8787"
echo "   🏥 Health: http://localhost:8787/health"
echo "   📊 Logs: docker compose logs -f webagent"
echo "   ⏹️  Detener: docker compose down"

# Test básico
echo ""
read -p "¿Deseas ejecutar un test básico? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "Ejecutando test básico..."
    
    TEST_RESPONSE=$(curl -s -X POST http://localhost:8787/explore/summarize \
        -H "Content-Type: application/json" \
        -d '{"url": "https://httpbin.org/html", "goal": "test deployment", "maxSteps": 2}')
    
    if echo "$TEST_RESPONSE" | grep -q "summary"; then
        log "✅ Test básico exitoso!"
    else
        warn "⚠️  Test básico falló. Revisar logs:"
        echo "   docker compose logs webagent"
    fi
fi

log "🎉 Despliegue completado!"
echo ""
echo -e "${GREEN}WebAgent está listo para recibir peticiones.${NC}"
