# WebAgent Makefile

.PHONY: help build start stop restart logs clean dev test health

# Variables
CONTAINER_NAME = webagent
IMAGE_NAME = webagent
PORT = 8787

# Default target
help:
	@echo "WebAgent - Comandos disponibles:"
	@echo ""
	@echo "  build      - Construir imagen Docker"
	@echo "  start      - Iniciar servicios con Docker Compose"
	@echo "  stop       - Detener servicios"
	@echo "  restart    - Reiniciar servicios"
	@echo "  logs       - Ver logs del contenedor"
	@echo "  clean      - Limpiar contenedores e imágenes"
	@echo "  dev        - Ejecutar en modo desarrollo (local)"
	@echo "  test       - Probar funcionalidad básica"
	@echo "  health     - Verificar salud del servicio"
	@echo "  deploy     - Desplegar en producción"
	@echo ""

# Desarrollo local
dev:
	@echo "🚀 Iniciando WebAgent en modo desarrollo..."
	npm run dev

# Docker operations
build:
	@echo "🔨 Construyendo imagen Docker..."
	docker compose build

start:
	@echo "▶️  Iniciando WebAgent..."
	docker compose up -d
	@echo "✅ WebAgent iniciado en http://localhost:$(PORT)"

stop:
	@echo "⏹️  Deteniendo WebAgent..."
	docker compose down

restart: stop start

logs:
	@echo "📋 Logs de WebAgent:"
	docker compose logs -f $(CONTAINER_NAME)

# Testing y verificación
health:
	@echo "🏥 Verificando salud del servicio..."
	@curl -s http://localhost:$(PORT)/health | jq . || echo "❌ Servicio no responde"

test:
	@echo "🧪 Probando funcionalidad básica..."
	@curl -X POST http://localhost:$(PORT)/explore/summarize \
		-H "Content-Type: application/json" \
		-d '{"url": "https://httpbin.org/html", "goal": "test", "maxSteps": 2}' \
		-s | jq -r '.summary' | head -3 || echo "❌ Test falló"

# Limpieza
clean:
	@echo "🧹 Limpiando contenedores e imágenes..."
	docker compose down --rmi all --volumes --remove-orphans
	docker system prune -f

# Producción
deploy:
	@echo "🚀 Desplegando en producción..."
	@if [ ! -f .env ]; then \
		echo "❌ Archivo .env no encontrado. Copia .env.example y configúralo."; \
		exit 1; \
	fi
	docker compose up -d --build
	@echo "✅ Desplegado en producción"

# Configuración inicial
setup:
	@echo "⚙️  Configuración inicial..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "📝 Archivo .env creado. Por favor configura tus API keys."; \
	fi
	@echo "✅ Configuración completa"

# Status
status:
	@echo "📊 Estado de WebAgent:"
	@docker compose ps

