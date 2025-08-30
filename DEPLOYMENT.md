# WebAgent VPS Deployment Guide

## 🚀 Despliegue Rápido en VPS

### 1. Preparar el VPS

```bash
# Conectar al VPS
ssh user@your-vps-ip

# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reiniciar sesión para aplicar permisos
exit
ssh user@your-vps-ip
```

### 2. Subir WebAgent al VPS

**Opción A: Git Clone (Recomendado)**
```bash
# En el VPS
cd /home/$USER
git clone https://github.com/tu-usuario/webagent.git
cd webagent
```

**Opción B: SCP Upload**
```bash
# Desde tu máquina local
scp -r /Users/pj/Desktop/Pulse\ Journal/WebAgent user@your-vps-ip:/home/user/webagent
```

### 3. Configurar Variables de Entorno

```bash
# En el VPS
cd /home/user/webagent
cp .env.example .env

# Editar configuración
nano .env
```

**Configurar en .env**:
```env
NODE_ENV=production
PORT=8787
OPENROUTER_API_KEY=tu_clave_openrouter_aqui
OPENAI_API_KEY=tu_clave_openai_aqui
```

### 4. Desplegar

**Método A: Script Automático**
```bash
chmod +x deploy.sh
./deploy.sh
```

**Método B: Manual**
```bash
# Construir e iniciar
docker compose up -d --build

# Verificar
docker compose ps
curl http://localhost:8787/health
```

### 5. Configurar Reverse Proxy (Nginx)

```bash
# Instalar Nginx
sudo apt install nginx -y

# Crear configuración
sudo nano /etc/nginx/sites-available/webagent
```

**Contenido del archivo**:
```nginx
server {
    listen 80;
    server_name webagent.tu-dominio.com;

    location / {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

```bash
# Activar sitio
sudo ln -s /etc/nginx/sites-available/webagent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL con Certbot

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Generar certificado
sudo certbot --nginx -d webagent.tu-dominio.com

# Verificar renovación automática
sudo certbot renew --dry-run
```

## 🔧 Comandos Útiles

### Gestión del Servicio
```bash
# Iniciar
docker compose up -d

# Detener
docker compose down

# Reiniciar
docker compose restart

# Ver logs
docker compose logs -f webagent

# Estado
docker compose ps
```

### Monitoreo
```bash
# Verificar salud
curl https://webagent.tu-dominio.com/health

# Test básico
curl -X POST https://webagent.tu-dominio.com/explore/summarize \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "goal": "test"}'

# Uso de recursos
docker stats webagent
```

### Mantenimiento
```bash
# Actualizar código
git pull
docker compose up -d --build

# Limpiar recursos
docker system prune -f

# Backup de configuración
tar -czf webagent-backup-$(date +%Y%m%d).tar.gz .env docker-compose.yml
```

## 🚨 Troubleshooting

### WebAgent no responde
```bash
# Verificar contenedor
docker ps | grep webagent
docker logs webagent

# Verificar puertos
sudo netstat -tlnp | grep 8787

# Reiniciar servicio
docker compose restart
```

### Error de memoria
```bash
# Verificar uso de memoria
free -h
docker stats

# Aumentar swap si es necesario
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Problemas de red
```bash
# Verificar conectividad
curl -I https://openrouter.ai
curl -I https://api.openai.com

# Verificar DNS
nslookup openrouter.ai
```

## 📊 Monitoreo Avanzado

### Con systemd (opcional)
```bash
# Crear servicio systemd
sudo nano /etc/systemd/system/webagent.service
```

```ini
[Unit]
Description=WebAgent Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/user/webagent
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# Activar servicio
sudo systemctl enable webagent.service
sudo systemctl start webagent.service
```

### Logs con logrotate
```bash
# Configurar rotación de logs
sudo nano /etc/logrotate.d/webagent
```

```
/var/lib/docker/containers/*/*-json.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    postrotate
        /bin/kill -USR1 $(cat /var/run/docker.pid) 2>/dev/null || true
    endscript
}
```

## 🔐 Seguridad

### Configuración de Firewall
```bash
# UFW básico
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# Solo para desarrollo - no usar en producción
# sudo ufw allow 8787
```

### Configuración adicional
- Cambiar puerto SSH por defecto
- Configurar fail2ban
- Usar claves SSH en lugar de contraseñas
- Mantener sistema actualizado

## 📈 Performance

### Optimizaciones recomendadas
- **CPU**: 2 cores mínimo para múltiples requests
- **RAM**: 2GB mínimo (4GB recomendado)
- **Disco**: SSD recomendado
- **Red**: Conexión estable para APIs de IA

### Escalamiento
Para alto tráfico, considera:
- Load balancer (nginx upstream)
- Múltiples instancias de WebAgent
- Cache con Redis
- Rate limiting

