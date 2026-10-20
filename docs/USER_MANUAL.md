# Manual de Usuario — LogMaster (Sistema de Gestión de Visitantes)

Versión de la interfaz web Next.js/Go — 2026

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
- Linux con Docker Engine y Compose; aplicación y PostgreSQL 16 en contenedores
- Conocimientos basicos de linea de comandos
- Acceso HTTPS al servidor; PostgreSQL y API permanecen en la red interna

---

## 2. Acceso al Sistema

### 2.1 Inicio de Sesion

1. Abrir el navegador web en la URL del sistema:
   - Laboratorio local: `https://localhost:8443` con certificado temporal
   - Empresa: hostname HTTPS y certificado confiable proporcionados por el administrador (véase [OPERATIONS](OPERATIONS.md))
2. Ingresar **usuario** y **contrasena**
3. Hacer clic en **Iniciar Sesion**

### 2.2 Primer Inicio (Cambio de Contrasena Obligatorio)

Si es la primera vez que inicia sesion, el sistema solicitara cambiar la contrasena:

1. Ingresar la **contrasena actual** (la proporcionada por el administrador)
2. Ingresar la **nueva contrasena** (minimo 12 caracteres, maximo 72 bytes UTF-8; debe incluir mayuscula, minuscula, numero y caracter especial)
3. Confirmar la nueva contrasena
4. Hacer clic en **Cambiar Contrasena**

### 2.3 Recuperacion de Contrasena

1. En la pantalla de inicio de sesión, hacer clic en **Olvidé mi contraseña**
2. Ingresar el nombre de usuario
3. El sistema muestra una confirmación genérica. Si la cuenta tiene un correo registrado y el servicio de correo está configurado, recibirá allí un enlace.
4. El enlace abre `/reset-password?token=...`, vence en 15 minutos y solo puede usarse una vez. Si no llega, contacte a Root; la respuesta de la pantalla no indica si el usuario existe ni si tiene correo.

### 2.4 Cierre de Sesion

1. Hacer clic en el icono de usuario (esquina superior derecha)
2. Seleccionar **Cerrar Sesion**

---

## 3. Roles y Permisos

| Rol | Descripcion | Acceso |
|---|---|---|
| **root** | Operación y administración completa; dashboard `/root` | Todas las funciones, incluidas cuentas, restablecimientos, auditoría y respaldos |
| **admin** | Operación y administración, sin gestión de cuentas | Registrar y administrar visitas, editar perfiles con contraseña adicional, bloquear, gestionar privacidad y respaldos |
| **operador** | Operación diaria | Registrar y mover visitas; consultar visitantes; editar perfiles con contraseña adicional. No puede bloquear, cancelar datos ni administrar respaldos/cuentas |
| **auditor** | Consulta | Consultar visitas, visitantes, informes, auditoría y solicitudes ARCO; no modifica datos operativos ni estados de solicitudes |
| **demo** | Consulta y recorrido demostrativo | Sin escrituras operativas en el servidor |

---

## 4. Modulo de Visitas

### 4.1 Registrar un Nuevo Ingreso (Check-in)

**Acceso**: Operador, Admin o Root

Paso a paso:

1. En el menu lateral, hacer clic en **Nueva Visita**
2. **Buscar visitante** por numero de cedula:
   - Si ya existe: los datos se cargan automaticamente (incluye fotos previas)
   - Si no existe: completar el formulario con los datos del visitante
3. **Capturar fotos** (opcional):
   - Foto del rostro (usar camara web)
   - Foto del documento de identidad
4. **Completar datos de la visita**:
   - Motivo de la visita
   - Persona a visitar
   - Departamento / Area (opcional)
   - Actividad de acceso: Ninguna, Carga o Descarga. Seleccionar **Descarga** para el personal que descarga materia prima.
   - Registrar a cada acompanante por separado para que tenga su propia identificacion, consentimiento y visita.
   - Vehiculo (opcional, solo si ingresa en auto)
   - Notas (opcional)
5. **Aceptar consentimiento**: El visitante debe aceptar la politica de privacidad
6. Elegir **Poner en espera** para que otra persona admita la visita después, o **Registrar entrada** si el acceso se autoriza de inmediato.

El formulario se limpia despues de cada registro, incluso si la visita queda en espera. Ingrese la cedula de cada acompanante y complete un registro individual.

El estado inicial depende de la acción elegida: **En Espera** (waiting) queda pendiente de admisión; **Activa** (active) registra el ingreso inmediato.

### 4.2 Admitir Visita en Espera

**Acceso**: Operador, Admin o Root

1. En el menu lateral, hacer clic en **Visitas en Espera**
2. Localizar la visita por nombre o cedula
3. Hacer clic en **Admitir**
4. La visita pasa a estado **Activa**

### 4.3 Registrar Salida (Check-out)

**Acceso**: Operador, Admin o Root

1. En el menu lateral, hacer clic en **Visitas Activas**
2. Localizar la visita
3. Hacer clic en **Check-out**
4. Opcional: agregar notas de salida
5. Confirmar

La visita pasa a estado **Completada**.

### 4.4 Salida Temporal y Reingreso (Intermittente)

**Acceso**: Operador, Admin o Root

Cuando un visitante sale temporalmente y regresara:

1. En **Visitas Activas**, localizar la visita
2. Hacer clic en **Salida Temporal**
3. Cuando regrese: hacer clic en **Reingreso**

El sistema registra automaticamente los horarios de salida y reingreso.

### 4.5 Listado de Visitas

**Acceso**: Operador, Admin o Root

- **Activas**: Visitantes actualmente en las instalaciones
- **En Espera**: Visitantes registrados esperando ser admitidos
- **Intermittentes**: Visitantes en salida temporal
- **Canceladas**: Solicitudes de ingreso canceladas antes de la admisión
- **Historial**: Todas las visitas con filtros por fecha, estado, visitante

---

## 5. Modulo de Visitantes

### 5.1 Buscar Visitante

**Acceso**: Operador, Admin, Auditor o Root

1. En el menu lateral, hacer clic en **Visitantes**
2. Ingresar numero de cedula en el buscador
3. El sistema muestra:
   - Datos personales (nombre, empresa, telefono, email)
   - Fotografia del rostro
   - Fotografia del documento
   - Historial de visitas

La búsqueda por texto requiere al menos tres caracteres. Las fotografías solo se sirven dentro de una sesión autenticada; no comparta enlaces a ellas.

### 5.2 Editar Datos del Visitante

**Acceso**: Operador, Admin o Root. Cada guardado requiere la contraseña de edición adicional; editar un perfil existente no ocurre automáticamente al registrar otra visita.

1. Buscar al visitante por cedula
2. Hacer clic en **Editar**
3. Modificar los campos necesarios
4. Guardar cambios

### 5.3 Bloquear Visitante

**Acceso**: Admin o Root. Cada cambio requiere la contraseña de edición adicional.

1. Buscar al visitante
2. Hacer clic en **Bloquear**
3. El visitante no podra registrar nuevos ingresos hasta ser desbloqueado

---

## 6. Modulo de Reportes

### 6.1 Estadisticas Generales

**Acceso**: Operador, Admin, Auditor o Root

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

**Acceso**: Admin, Auditor o Root

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
Para exportar visitas, filtra el listado antes de descargar: PDF admite hasta 2.000 visitas y Excel hasta 20.000. Si el total excede el límite, reduce el rango o los filtros; el sistema no descarga un archivo incompleto. El PDF del calendario tiene el mismo límite de 2.000 visitas.

---

## 7. Modulo de Auditoria

### 7.1 Consultar Logs de Actividad

**Acceso**: Auditor, Admin o Root

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

**Acceso**: Operador, Admin o Root pueden registrar solicitudes. Admin, Root y Auditor pueden consultarlas; solo Admin o Root pueden cambiar su estado.

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

### 8.2 Consultar y gestionar solicitudes

1. En **Privacidad**, seleccionar **Solicitudes ARCO**
2. Ver listado de solicitudes con filtros por estado
3. Hacer clic en una solicitud para ver detalle
4. Admin o Root pueden cambiar el estado y agregar notas de resolución. Auditor tiene acceso de consulta únicamente.

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

**Acceso**: Admin o Root. Debe verificarse la identidad del solicitante y el perfil no puede tener visitas en espera, activas o con salida temporal.

1. Buscar al titular por cedula
2. Hacer clic en **Cancelar Datos**
3. Confirmar la identidad y la operación
4. Si hay una visita abierta, cierre primero la visita: la cancelación responde con un conflicto y no borra datos.
5. El sistema anonimiza el perfil, elimina sus fotografías y valores personales del historial de cambios; conserva eventos y visitas anonimizados.
6. Los respaldos creados antes de la cancelación pueden seguir conteniendo esos datos. Revise cancelaciones posteriores a la fecha del respaldo antes de restaurarlo.

---

## 9. Modulo de Respaldos (Backups)

**Acceso**: Admin o Root

### 9.1 Crear Respaldo

1. En el menú lateral, hacer clic en **Respaldos** para consultar las copias disponibles.
2. En el entorno de ensayo puede usarse **Crear respaldo** para generar un archivo cifrado `.dump.enc` y sus metadatos.
3. En una instalación operativa, crear copias mediante el CLI de mantenimiento y el timer diario, no desde la interfaz.
4. Conservar la contraseña por separado; las claves y la configuración privada requieren custodia independiente.

### 9.2 Listar Respaldos

1. En **Respaldos**, ver el listado de respaldos disponibles
2. Cada respaldo muestra: nombre, fecha, tamano

### 9.3 Restaurar Respaldo

La restauración desde la interfaz solo está habilitada para el entorno de ensayo `logmaster_restore_test`. En una instalación operativa, el administrador debe detener la aplicación y utilizar el CLI de mantenimiento descrito en [OPERATIONS](OPERATIONS.md). Se valida una copia temporal antes de reemplazar el destino confirmado; los usuarios deben volver a iniciar sesión tras la restauración.

Un respaldo puede contener datos personales cancelados después de su creación. Revisar esas cancelaciones antes de restaurarlo.

---

## 10. Modulo de Administracion de Usuarios

**Acceso**: Root (dashboard SuperAdmin, ruta `/root`)

### 10.1 Crear Usuario

1. En el menu lateral, hacer clic en **Usuarios** (solo visible para Root)
2. Hacer clic en **Crear Usuario**
3. Completar:
   - Nombre de usuario
   - Correo electrónico (obligatorio para cuentas operativas; demo puede omitirlo)
   - Contraseña inicial (mínimo 12 caracteres, mayúscula, minúscula, número y símbolo; máximo 72 bytes UTF-8)
   - Rol (Root / Admin / Operador / Auditor / Demo)
4. Hacer clic en **Crear**

### 10.2 Editar Usuario

1. En el listado, hacer clic en **Editar**
2. Modificar: nombre de usuario, rol
3. Guardar cambios

### 10.3 Eliminar Usuario

1. Hacer clic en **Eliminar**
2. Confirmar la operacion
3. **Nota**: No se puede eliminar al unico usuario Root

### 10.4 Resetear Contrasena

1. Hacer clic en **Resetear Contrasena**
2. Ingresar una contraseña que cumpla la política de seguridad
3. El usuario deberá cambiarla en el próximo inicio de sesión; las sesiones anteriores quedan invalidadas.

---

## 11. Recepcion de Eventos en Tiempo Real

El sistema actualiza automaticamente las pantallas cuando ocurren cambios:

- Nuevo check-in: la lista de espera se actualiza
- Admision: la visita pasa de "espera" a "activas"
- Check-out: la visita desaparece de "activas"
- Salida temporal: aparece en "intermitentes"

No es necesario recargar la pagina manualmente.
Al cerrar sesión se invalidan las sesiones de la cuenta; los demás dispositivos deberán volver a iniciar sesión.

---

## 12. Buenas Practicas Operativas

### Para el Operador

- **Verificar identidad**: Confirmar que la foto del documento coincida con el rostro
- **No compartir credenciales**: Cada operador debe usar su propio usuario
- **Consentimiento obligatorio**: No registrar visitantes sin su autorizacion
- **Fotos claras**: Asegurar buena iluminacion al capturar fotos
- **Registrar notas**: Agregar observaciones relevantes (ej: "ingresa con paquete")
- **Cerrar sesion al terminar turno**: Evita uso no autorizado de su cuenta

### Para el Admin

- **Proteger las credenciales**: usar una contraseña única y pedir un restablecimiento a Root ante una posible exposición
- **Revisar la supervisión diariamente**: especialmente salud, espacio y resultado del respaldo
- **Verificar el ensayo semanal**: confirmar que la restauración desechable terminó correctamente
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
3. Contactar al usuario Root para resetear la contrasena

### 13.2 «Debe cambiar su contraseña» (403)

**Que significa:** La politica de seguridad exige un cambio de contrasena.
**Que hacer:**
1. Ir a **Cambiar contraseña**
2. Ingresar contrasena actual y nueva
3. La nueva contraseña debe tener al menos 12 caracteres, mayúscula, minúscula, número y símbolo; máximo 72 bytes UTF-8.

### 13.3 "No tiene permisos" (403)

**Que significa:** Su rol no tiene acceso a esa funcion.
**Que hacer:** Contactar al usuario Root si necesita el permiso.

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
- La solicitud completa supera 5 MiB; las fotos viajan codificadas en base64 y comparten ese límite con el resto del formulario.
- Formato o contenido no válido; se admiten imágenes decodificables con dimensiones de hasta 16 millones de píxeles y tamaño binario de hasta 5 MiB por imagen.
- Problema de conexion

**Solucion:**
1. Reducir el tamaño de la foto para que la solicitud completa quepa en 5 MiB
2. Usar una imagen válida y legible por el navegador
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
*Actualizado el 19 de octubre de 2026 — LogMaster con Next.js y backend Go.*
