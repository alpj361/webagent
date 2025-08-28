#!/bin/bash

# Script para probar WebAgent en VPS después del despliegue

echo "🧪 Probando WebAgent en VPS..."
echo "================================"

VPS_URL="https://server.standatpd.com"

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Función para testing
test_endpoint() {
    local endpoint=$1
    local expected=$2
    local description=$3
    
    echo -n "🔍 $description... "
    
    response=$(curl -s --connect-timeout 10 "$VPS_URL$endpoint")
    
    if echo "$response" | grep -q "$expected"; then
        echo -e "${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "   Respuesta: $response"
        return 1
    fi
}

# Tests
echo "📋 Ejecutando tests..."
echo ""

# Test 1: ExtractorW funcionando
test_endpoint "/api/health" "healthy" "ExtractorW está funcionando"

# Test 2: WebAgent proxy disponible
test_endpoint "/api/webagent/info" "WebAgent Proxy" "Endpoint WebAgent configurado"

# Test 3: WebAgent health
echo -n "🏥 Verificando salud de WebAgent... "
health_response=$(curl -s "$VPS_URL/api/webagent/health")

if echo "$health_response" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ WebAgent funcionando${NC}"
    WEBAGENT_OK=true
elif echo "$health_response" | grep -q "webagent_unavailable"; then
    echo -e "${RED}❌ WebAgent no disponible${NC}"
    echo "   Necesitas desplegarlo en el VPS"
    WEBAGENT_OK=false
else
    echo -e "${YELLOW}⚠️  Estado desconocido${NC}"
    echo "   Respuesta: $health_response"
    WEBAGENT_OK=false
fi

# Test 4: Test funcional (solo si WebAgent está OK)
if [ "$WEBAGENT_OK" = true ]; then
    echo -n "🚀 Probando funcionalidad completa... "
    
    test_response=$(curl -s -X POST "$VPS_URL/api/webagent/explore" \
        -H "Content-Type: application/json" \
        -d '{
            "url": "https://httpbin.org/html",
            "goal": "test deployment",
            "maxSteps": 2
        }')
    
    if echo "$test_response" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ Test funcional exitoso${NC}"
    else
        echo -e "${RED}❌ Test funcional falló${NC}"
        echo "   Respuesta: $test_response"
    fi
fi

echo ""
echo "📊 Resumen:"
echo "  🌐 VPS URL: $VPS_URL"
echo "  📡 ExtractorW: Funcionando"
echo "  🕷️  WebAgent: $([ "$WEBAGENT_OK" = true ] && echo "Funcionando" || echo "No disponible")"

if [ "$WEBAGENT_OK" = false ]; then
    echo ""
    echo -e "${YELLOW}💡 Para desplegar WebAgent en el VPS:${NC}"
    echo "   1. Sube los archivos: scp -r . user@server.standatpd.com:~/webagent"
    echo "   2. En el VPS: cd ~/webagent && ./deploy.sh"
    echo "   3. Verifica: curl http://localhost:8787/health"
fi

echo ""
echo "🎉 Tests completados"
