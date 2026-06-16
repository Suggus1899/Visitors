# Manual de Usuario — LogMaster (Sistema de Gestion de Visitantes)

Version 1.0 — 2026

---

## 1. Introduccion

LogMaster es un sistema de control de acceso para visitantes en empresas. Permite registrar ingresos y salidas, capturar fotografias, generar reportes, auditar operaciones y gestionar solicitudes de privacidad (ARCO).

## 2. Requisitos Previos

### 2.1 Para el Usuario Final

- Navegador web moderno: Google Chrome, Microsoft Edge, Mozilla Firefox o Safari
- Conexion de red al servidor del sistema (LAN o internet)
- Camara web funcional (para capturar fotos de visitantes)
- Credenciales de acceso proporcionadas por el administrador

### 2.2 Para el Administrador del Sistema

- Acceso fisico o remoto al servidor donde corre la aplicacion
- Docker Desktop o Node.js instalado en el servidor
- Conocimientos basicos de linea de comandos
- Puertos 80, 443, 3000 y 5432 disponibles en el firewall

---

## 2. Acceso al Sistema

### 2.1 Inicio de Sesion

1. Abrir el navegador web en la URL del sistema:
   - Local: `http://localhost`
   - LAN: `http://192.168.x.x` (ver con `scripts\status.bat`)
2. Ingresar **usuario** y **contrasena**
3. Hacer clic en **Iniciar Sesion**

### 2.2 Primer Inicio (Cambio de Contrasena Obligatorio)

Si es la primera vez que inicia sesion, el sistema solicitara cambiar la contrasena:

1. Ingresar la **contrasena actual** (la proporcionada por el administrador)
2. Ingresar la **nueva contrasena** (minimo 12 caracteres, debe incluir mayuscula, minuscula, numero y caracter especial)
3. Confirmar la nueva contrasena
4. Hacer clic en **Cambiar Contrasena**

### 2.3 Recuperacion de Contrasena

1. En la pantalla de login, hacer clic en **Olvide mi contrasena**
2. Ingresar el nombre de usuario
3. Si el correo SMTP esta configurado: recibira un enlace en su correo electronico
4. Si el correo NO esta configurado: contactar al SuperAdmin para resetear la contrasena

### 2.4 Cierre de Sesion

1. Hacer clic en el icono de usuario (esquina superior derecha)
2. Seleccionar **Cerrar Sesion**

---

## 3. Roles y Permisos

| Rol | Descripcion | Acceso |
|---|---|---|
| **Guardia** | Operacion diaria: registro de visitantes, check-in/check-out | Visitas, Visitantes, Reportes basicos |
| **Admin** | Gestion completa: usuarios, respaldos, reportes, auditoria | Todo excepto crear/modificar usuarios |
| **Auditor** | Solo lectura: consulta de logs, reportes, solicitudes ARCO | Auditoria, Reportes, ARCO (sin modificar) |
| **SuperAdmin** | Gestion de usuarios del sistema | Crear/editar/eliminar usuarios, ver logs de auditoria |

---

## 4. Modulo de Visitas

### 4.1 Registrar un Nuevo Ingreso (Check-in)

**Acceso**: Guardia, Admin

Paso a paso:

1. En el menu lateral, hacer clic en **Nueva Visita**
2. **Buscar visitante** por numero de cedula:
   - Si ya existe: los datos se cargan automaticamente (incluye fotos previas)
   - Si no existe: completar el formulario con los datos del visitante
3. **Capturar fotos** (obligatorio):
   - Foto del rostro (usar camara web)
   - Foto del documento de identidad
4. **Completar datos de la visita**:
   - Motivo de la visita
   - Persona a visitar
   - Departamento / Area (opcional)
   - Acompanante (opcional)
   - Vehiculo (opcional, solo si ingresa en auto)
   - Notas (opcional)
5. **Aceptar consentimiento**: El visitante debe aceptar la politica de privacidad
6. Hacer clic en **Registrar Ingreso**

La visita queda en estado **En Espera** (waiting) pendiente de admission.

### 4.2 Admitir Visita en Espera

**Acceso**: Guardia, Admin

1. En el menu lateral, hacer clic en **Visitas en Espera**
2. Localizar la visita por nombre o cedula
3. Hacer clic en **Admitir**
4. La visita pasa a estado **Activa**

### 4.3 Registrar Salida (Check-out)

**Acceso**: Guardia, Admin

1. En el menu lateral, hacer clic en **Visitas Activas**
2. Localizar la visita
3. Hacer clic en **Check-out**
4. Opcional: agregar notas de salida
5. Confirmar

La visita pasa a estado **Completada**.

### 4.4 Salida Temporal y Reingreso (Intermittente)

**Acceso**: Guardia, Admin

Cuando un visitante sale temporalmente y regresara:

1. En **Visitas Activas**, localizar la visita
2. Hacer clic en **Salida Temporal**
3. Cuando regrese: hacer clic en **Reingreso**

El sistema registra automaticamente los horarios de salida y reingreso.

### 4.5 Listado de Visitas

**Acceso**: Guardia, Admin

- **Activas**: Visitantes actualmente en las instalaciones
- **En Espera**: Visitantes registrados esperando ser admitidos
- **Intermittentes**: Visitantes en salida temporal
- **Historial**: Todas las visitas con filtros por fecha, estado, visitante

---

## 5. Modulo de Visitantes

### 5.1 Buscar Visitante

**Acceso**: Guardia, Admin, Auditor

1. En el menu lateral, hacer clic en **Visitantes**
2. Ingresar numero de cedula en el buscador
3. El sistema muestra:
   - Datos personales (nombre, empresa, telefono, email)
   - Fotografia del rostro
   - Fotografia del documento
   - Historial de visitas

### 5.2 Editar Datos del Visitante

**Acceso**: Admin

1. Buscar al visitante por cedula
2. Hacer clic en **Editar**
3. Modificar los campos necesarios
4. Guardar cambios

### 5.3 Bloquear Visitante

**Acceso**: Admin

1. Buscar al visitante
2. Hacer clic en **Bloquear**
3. El visitante no podra registrar nuevos ingresos hasta ser desbloqueado

---

## 6. Modulo de Reportes

### 6.1 Estadisticas Generales

**Acceso**: Guardia, Admin, Auditor

1. En el menu lateral, hacer clic en **Reportes**
2. Seleccionar **Estadisticas**
3. Filtrar por rango de fechas (inicio y fin)
4. El sistema muestra:
   - Total de visitas en el periodo
   - Visitas activas actuales
   - Visitas completadas
   - Promedio de visitas por dia

### 6.2 Reporte Mensual

1. En **Reportes**, seleccionar **Reporte Mensual**
2. Elegir mes y ano
3. El sistema muestra:
   - Total de visitas del mes
   - Comparativa con mes anterior
   - Distribucion por departamento/area
   - Grafico de tendencia diaria

### 6.3 Alertas de Check-out Omitido

**Acceso**: Admin, Auditor

1. En **Reportes**, seleccionar **Alertas**
2. El sistema muestra visitas donde no se registro la salida
3. Util para control de personal y seguridad

### 6.4 Comparativa de Periodos

1. En **Reportes**, seleccionar **Comparativa**
2. Seleccionar dos periodos a comparar
3. El sistema muestra la diferencia porcentual entre ambos periodos

### 6.5 Exportar Reportes

Los reportes pueden exportarse a:
- **PDF**: Ideal para imprimir o enviar por correo
- **Excel**: Ideal para analisis en hojas de calculo

Hacer clic en el boton **Exportar** y seleccionar el formato deseado.

---

## 7. Modulo de Auditoria

### 7.1 Consultar Logs de Actividad

**Acceso**: Auditor, Admin

1. En el menu lateral, hacer clic en **Auditoria**
2. Aplicar filtros:
   - **Accion**: tipo de operacion (LOGIN, CHECKIN, CHECKOUT, CREATE_USER, etc.)
   - **Usuario**: nombre del operador
   - **Fecha desde / hasta**: rango de tiempo
   - **Estado**: success / failure
3. Hacer clic en **Buscar**
4. Los resultados muestran:
   - Fecha y hora
   - Usuario que realizo la accion
   - Tipo de accion
   - Detalle de la operacion
   - Direccion IP
   - Estado (exito/fallo)

### 7.2 Exportar Logs

1. Aplicar los filtros deseados
2. Hacer clic en **Exportar**
3. Seleccionar formato **Excel** o **CSV**

### 7.3 Estadisticas de Auditoria

1. En **Auditoria**, seleccionar **Estadisticas**
2. El sistema muestra:
   - Total de operaciones registradas
   - Operaciones por tipo (grafico)
   - Usuarios mas activos
   - Tasa de fallos vs exitos

### 7.4 Configuracion de Retencion

1. En **Auditoria**, seleccionar **Configuracion**
2. Muestra los periodos de retencion configurados:
   - Datos de visitantes: X dias
   - Logs de auditoria: X dias

---

## 8. Modulo de Privacidad (ARCO)

### 8.1 Crear Solicitud ARCO

**Acceso**: Guardia, Admin (solicitante), Auditor (gestion)

Derechos ARCO: Acceso, Rectificacion, Cancelacion, Oposicion.

1. En el menu lateral, hacer clic en **Privacidad**
2. Seleccionar **Nueva Solicitud ARCO**
3. Completar:
   - Tipo de solicitud (Acceso / Rectificacion / Cancelacion / Oposicion)
   - Cedula del titular
   - Nombre del solicitante
   - Correo electronico de contacto
   - Motivo de la solicitud
4. Hacer clic en **Enviar**

### 8.2 Gestionar Solicitudes (Auditor/Admin)

1. En **Privacidad**, seleccionar **Solicitudes ARCO**
2. Ver listado de solicitudes con filtros por estado
3. Hacer clic en una solicitud para ver detalle
4. Cambiar estado: **En Proceso** / **Completada** / **Rechazada**
5. Agregar notas de resolucion

### 8.3 Acceso a Datos del Titular

1. En **Privacidad**, seleccionar **Acceso a Datos**
2. Ingresar la cedula del titular
3. El sistema muestra todos los datos personales almacenados
4. Incluye historial de visitas asociadas

### 8.4 Rectificacion de Datos

1. Buscar al titular por cedula
2. Hacer clic en **Rectificar**
3. Modificar los campos solicitados
4. Guardar cambios

### 8.5 Cancelacion (Anonimizacion)

**Acceso**: Admin

1. Buscar al titular por cedula
2. Hacer clic en **Cancelar Datos**
3. Confirmar la operacion
4. El sistema anonimiza los datos personales y elimina las fotos
5. Las visitas historicas se conservan sin datos personales

---

## 9. Modulo de Respaldos (Backups)

**Acceso**: Admin

### 9.1 Crear Respaldo

1. En el menu lateral, hacer clic en **Respaldos**
2. Hacer clic en **Crear Respaldo**
3. El sistema genera un archivo .dump con:
   - Todas las tablas y datos
   - Configuracion del sistema
4. El respaldo aparece en el listado con fecha y hora

### 9.2 Listar Respaldos

1. En **Respaldos**, ver el listado de respaldos disponibles
2. Cada respaldo muestra: nombre, fecha, tamano

### 9.3 Restaurar Respaldo

1. En el listado, hacer clic en **Restaurar** sobre el respaldo deseado
2. Confirmar la restauracion
3. **ADVERTENCIA**: Esto sobrescribe todos los datos actuales

---

## 10. Modulo de Administracion de Usuarios

**Acceso**: SuperAdmin

### 10.1 Crear Usuario

1. En el menu lateral, hacer clic en **Usuarios** (solo visible para SuperAdmin)
2. Hacer clic en **Crear Usuario**
3. Completar:
   - Nombre de usuario
   - Contrasena (debe cumplir la politica de seguridad)
   - Rol (Admin / Guardia / Auditor)
4. Hacer clic en **Crear**

### 10.2 Editar Usuario

1. En el listado, hacer clic en **Editar**
2. Modificar: nombre de usuario, rol
3. Guardar cambios

### 10.3 Eliminar Usuario

1. Hacer clic en **Eliminar**
2. Confirmar la operacion
3. **Nota**: No se puede eliminar al unico SuperAdmin

### 10.4 Resetear Contrasena

1. Hacer clic en **Resetear Contrasena**
2. Ingresar la nueva contrasena
3. El usuario debera cambiarla en el proximo inicio de sesion

---

## 11. Recepcion de Eventos en Tiempo Real

El sistema actualiza automaticamente las pantallas cuando ocurren cambios:

- Nuevo check-in: la lista de espera se actualiza
- Admision: la visita pasa de "espera" a "activas"
- Check-out: la visita desaparece de "activas"
- Salida temporal: aparece en "intermitentes"

No es necesario recargar la pagina manualmente.

---

## 12. Buenas Practicas Operativas

### Para el Guardia

- **Verificar identidad**: Confirmar que la foto del documento coincida con el rostro
- **No compartir credenciales**: Cada guardia debe usar su propio usuario
- **Consentimiento obligatorio**: No registrar visitantes sin su autorizacion
- **Fotos claras**: Asegurar buena iluminacion al capturar fotos
- **Registrar notas**: Agregar observaciones relevantes (ej: "ingresa con paquete")
- **Cerrar sesion al terminar turno**: Evita uso no autorizado de su cuenta

### Para el Admin

- **Cambiar contrasenas periodicamente**: Cada 90 dias recomendado
- **Revisar alertas diariamente**: Especialmente check-outs omitidos
- **Respaldos frecuentes**: Al menos 1 vez por semana
- **Monitorear la auditoria**: Revisar actividad sospechosa
- **Actualizar datos de visitantes**: Mantener la informacion al dia

### Para el Auditor

- **Documentar hallazgos**: Exportar logs para reportes de auditoria
- **Verificar consistencia**: Cruzar informacion de visitas con registros fisicos
- **Revisar periodicamente**: Auditoria semanal recomendada

---

## 13. Solucion de Problemas (Usuario Final)

### 13.1 No puedo iniciar sesion

**Causas posibles:**
- Usuario o contrasena incorrectos
- Cuenta bloqueada por muchos intentos fallidos (esperar 15 minutos)
- Sesion expirada

**Solucion:**
1. Verificar que el usuario y contrasena sean correctos
2. Esperar 15 minutos si la cuenta se bloqueo
3. Contactar al SuperAdmin para resetear la contrasena

### 13.2 "Debe cambiar su contrasena" (403)

**Que significa:** La politica de seguridad exige un cambio de contrasena.
**Que hacer:**
1. Ir a Configuracion > Cambiar Contrasena
2. Ingresar contrasena actual y nueva
3. La nueva contrasena debe tener: 12+ caracteres, mayuscula, minuscula, numero, simbolo

### 13.3 "No tiene permisos" (403)

**Que significa:** Su rol no tiene acceso a esa funcion.
**Que hacer:** Contactar al SuperAdmin si necesita el permiso.

### 13.4 "Demasiadas solicitudes" (429)

**Que significa:** Ha excedido el limite de operaciones por minuto.
**Que hacer:** Esperar 1 minuto y reintentar.

### 13.5 La camara no funciona

**Causas posibles:**
- Permisos de camara no concedidos en el navegador
- Otra aplicacion esta usando la camara
- Navegador no soportado

**Solucion:**
1. Permitir acceso a camara cuando el navegador lo solicite
2. Cerrar otras aplicaciones que usen la camara
3. Usar Chrome, Edge o Firefox actualizados

### 13.6 La pagina no carga

**Causas posibles:**
- El servidor no esta corriendo
- Problema de red

**Solucion:**
1. Verificar que el servidor este encendido
2. Contactar al administrador tecnico
3. Si es error de red: verificar conexion WiFi/LAN

### 13.7 Error al subir fotos

**Causas posibles:**
- Archivo demasiado grande (max 10MB)
- Formato no soportado (usar JPG o PNG)
- Problema de conexion

**Solucion:**
1. Reducir el tamano de la foto
2. Usar formato JPG
3. Reintentar la operacion

---

## 14. Glosario

| Termino | Definicion |
|---|---|
| **Check-in** | Registro de ingreso del visitante |
| **Check-out** | Registro de salida del visitante |
| **Waiting** | Visita registrada pendiente de admission |
| **Active** | Visitante actualmente en las instalaciones |
| **Intermittent** | Visitante en salida temporal con reingreso previsto |
| **Completed** | Visita finalizada con check-out registrado |
| **ARCO** | Acceso, Rectificacion, Cancelacion, Oposicion (derechos de privacidad) |
| **Cedula** | Documento de identidad / ID del visitante |
| **JWT** | Token de autenticacion (JSON Web Token) |
| **SSE** | Server-Sent Events (actualizaciones en tiempo real) |
| **Rate Limit** | Limite de peticiones para prevenir abuso |

---

## 15. Soporte

Si encuentra un error o necesita ayuda:

1. **Anotar**: Fecha, hora, modulo donde ocurrio, mensaje de error exacto
2. **Contactar**: Al administrador tecnico del sistema
3. **Consultar**: `docs/` para documentacion detallada

---
*Documento generado: 2026 — LogMaster v1.0*
