# Seed de Datos Completo - Sistema de Visitas

Este documento describe el seed completo del sistema que cubre todos los casos de uso posibles.

## 🎯 Casos Cubiertos

El seed genera datos que cubren **todos los estados y escenarios** del sistema:

### 1. Estados de Visitas

- **WAITING (En Espera)**: 8 visitas esperando autorización de ingreso
- **ACTIVE (Activas)**: 20 visitas de visitantes actualmente dentro de las instalaciones
- **COMPLETED (Completadas)**: 102 visitas históricas finalizadas (90 en enero + 12 en febrero)

### 2. Datos de Visitantes (40 visitantes únicos)

Cada visitante incluye:
- ✅ Cédula (encriptada)
- ✅ Nombre y apellido (encriptados)
- ✅ Empresa
- ✅ Título de trabajo (Gerente, Supervisor, Técnico, etc.)
- ✅ Email (encriptado)
- ✅ Teléfono (encriptado)

### 3. Datos Completos de Visitas

Cada visita puede incluir:
- ✅ Motivo de la visita
- ✅ Persona a visitar
- ✅ Notas adicionales
- ✅ **Acompañante** (nombre y cédula)
- ✅ **Vehículo** (marca, modelo, placa)
- ✅ **Área** (Oficina, Planta, Almacén, Ninguna)
- ✅ **Acción** (Carga, Descarga, Ninguna)
- ✅ **Departamento** (Administración, Ventas, Logística, etc.)

### 4. Distribución Temporal

- **Enero 2026**: 90 visitas completadas (datos históricos)
- **Febrero 2026**: 40 visitas (8 en espera, 20 activas, 12 completadas)

## 🚀 Cómo Ejecutar el Seed

### Opción 1: Agregar datos sin limpiar

```bash
cd server
npm run seed
```

Este comando:
- Mantiene los datos existentes
- Solo agrega datos si hay menos de 50 visitas en la BD
- Crea usuarios base si no existen

### Opción 2: Limpiar y regenerar todo

```bash
cd server
npm run seed:clean
```

Este comando:
- **ELIMINA** todas las visitas y visitantes existentes
- Regenera todos los datos desde cero
- Mantiene los usuarios del sistema

### Opción 3: Solo limpiar la base de datos

```bash
cd server
npm run db:reset
```

Este comando:
- Elimina todas las visitas y visitantes
- Mantiene los usuarios del sistema
- No genera nuevos datos

## 👥 Usuarios del Sistema

El seed crea automáticamente estos usuarios:

| Usuario | Contraseña | Rol | Descripción |
|---------|-----------|-----|-------------|
| Admin@trebol.com | Trebol123* | admin | Administrador principal |
| admin | admin123 | admin | Admin legacy |
| guard | guard123 | guard | Guardia de seguridad |
| demo | demo123 | admin | Usuario demo |
| auditor | audit2026 | auditor | Auditor del sistema |

## 📊 Resumen de Datos Generados

Después de ejecutar el seed, tendrás:

```
👥 Visitantes: 40
⏳ Visitas en espera: 8
✅ Visitas activas: 20
📋 Visitas completadas: 102
📈 Total de visitas: 130
```

## 🧪 Casos de Prueba Disponibles

### 1. Panel "En Espera"
- 8 visitantes esperando autorización
- Algunos con vehículos, otros sin vehículo
- Algunos con acompañantes
- Diferentes áreas y departamentos

### 2. Panel "Visitas Activas"
- 20 visitantes actualmente dentro
- Diferentes tiempos de permanencia (1-6 horas)
- Variedad de motivos de visita
- Datos completos de vehículos y acompañantes

### 3. Panel "Historial/Completadas"
- 102 visitas finalizadas
- Distribuidas en enero y febrero 2026
- Datos completos para reportes y estadísticas

### 4. Formulario de Check-in
- Visitantes existentes para búsqueda rápida
- Empresas variadas para autocompletado
- Diferentes títulos de trabajo

### 5. Reportes y Estadísticas
- Datos suficientes para gráficos mensuales
- Comparativas entre meses
- Análisis por empresa, departamento, área

## 🔐 Seguridad

Todos los datos sensibles están encriptados:
- Cédulas (hash + encriptación)
- Nombres y apellidos
- Emails
- Teléfonos
- Títulos de trabajo

## 📝 Notas Técnicas

- El seed es **idempotente**: puede ejecutarse múltiples veces sin duplicar datos
- Usa `--clean` solo cuando necesites empezar desde cero
- Los datos generados son realistas pero ficticios
- Las fechas de enero son históricas, las de febrero son actuales

## 🐛 Troubleshooting

### El seed no genera datos
- Verifica que la base de datos esté inicializada
- Asegúrate de que el servidor no esté corriendo
- Revisa que las variables de entorno estén configuradas

### Error de encriptación
- Verifica que `ENCRYPTION_KEY` esté en el archivo `.env`
- La clave debe tener exactamente 32 caracteres

### Datos duplicados
- Usa `npm run seed:clean` para limpiar y regenerar
- O usa `npm run db:reset` seguido de `npm run seed`
