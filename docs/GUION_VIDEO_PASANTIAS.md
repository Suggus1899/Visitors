# Guion de Video - Pasantias LogMaster

> **Duracion target:** 6:50 (maximo 7:00)
> **Formato:** 1080p, 16:9, MP4 H.264/AAC
> **Presentadores:** Gustavo Colina (backend) y German Cordero (frontend)

---

## Título del video (para Telegram)

```
[Pasantías] - LogMaster Sistema de Control de Acceso - Gustavo Colina y Germán Cordero
```

## Descripcion del video (caja de descripcion)

```
Sistema de control de acceso de visitantes para la Industria de Alimentos El Trébol.
Backend en Node.js + Clean Architecture + PostgreSQL y frontend en React + Electron.
Proyecto desarrollado en 320 horas de pasantías (12 semanas).

Colina Martínez, Gustavo José - C.I: 31.182.936 - Sede San Juan de los Morros
Cordero Gómez, Germán Rafael - C.I: 29.858.403 - Sede San Juan de los Morros

Timestamps:
0:00 Introducción y Contexto
2:00 Propuesta de Solución
3:50 Desarrollo y Demostración
5:00 Resultados, Conclusiones y Recomendaciones
6:40 Cierre

Tecnologías: TypeScript, Node.js, Express, Sequelize, PostgreSQL, React, Vite,
Tailwind CSS, React Query, Electron, Vitest, GitHub Actions, Zod, JWT,
AES-256-GCM, Server-Sent Events, Chart.js, jsPDF, ExcelJS.
```

---

## BLOQUE 1 — Introducción y Contexto (0:00 - 2:00)

### 0:00 - 0:25 | Apertura (camara, ambos en cuadro)

**[VISUAL]** Diapositiva de portada: logo UNERG, logo El Trébol, nombre del proyecto.
Fondo limpio. Ambos pasantes frente a la camara, uniforme de pasantias AIS.

**GUSTAVO:**
> Buenos dias. Soy Gustavo Colina, C.I. 31.182.936, y junto a mi companero German Cordero presentamos el proyecto LogMaster, el Sistema de Control de Acceso de Visitantes desarrollado durante nuestra pasantia profesional.

**GERMAN:**
> Soy German Cordero, C.I. 29.858.403. Ambos cursamos el programa de Ingenieria en Informatica en la Universidad Nacional Experimental Romulo Gallegos, sede San Juan de los Morros.

### 0:25 - 0:45 | Empresa y tutores

**[VISUAL]** Diapositiva con datos de la empresa y tutores.

**GUSTAVO:**
> La pasantia se desarrollo en la Industria de Alimentos El Trebol, ubicada en la Zona Industrial Corinsa, en Cagua, estado Aragua. Contamos con el acompanamiento del tutor empresarial, el T.S.U. Jose Romero, Encargado de Soporte IT, y del tutor academico, el Ing. Victor Rojas.

### 0:45 - 2:00 | Problema detectado

**[VISUAL]** Diagrama de actividades del flujo manual actual (mostrar en pantalla).

**GERMAN:**
> Al llegar a la empresa, detectamos que el registro de visitantes se llevaba en bitacoras manuales en papel. Esto generaba tres problemas criticos: primero, latencia en los puntos de control, con cuellos de botella en horas pico; segundo, perdida de trazabilidad, porque los registros en papel se deterioraban o se extraviaban; y tercero, un riesgo grave de seguridad, ya que los datos personales de los visitantes quedaban expuestos sin ningun tipo de cifrado ni control de acceso.

**GUSTAVO:**
> Desde el lado del backend, el desafio era aun mayor. Se necesitaba centralizar las transacciones en tiempo real para evitar condiciones de carrera cuando varios operadores registraban entradas simultaneamente. Ademas, habia que garantizar la integridad referencial de los datos y proteger la informacion personal bajo estandares criptograficos. La necesidad fundamental era construir una arquitectura de servidor robusta, escalable y auditable.

**[VISUAL]** Mostrar diagrama de actividades en pantalla completa durante 10 segundos.

---

## BLOQUE 2 — Propuesta de Solucion (2:00 - 3:50)

### 2:00 - 2:55 | Solucion de backend (Gustavo)

**[VISUAL]** Diapositiva: diagrama de capas de Clean Architecture.

**GUSTAVO:**
> Para el backend, seleccionamos Clean Architecture como paradigma de diseno. Esto nos permitio separar estrictamente tres capas: el dominio, donde viven las entidades y reglas de negocio puras; la aplicacion, con los casos de uso que orquestan la logica; y la infraestructura, con los controladores REST y repositorios. La ventaja clave es que el nucleo del negocio queda aislado de cualquier tecnologia externa, haciendo el sistema testeable y mantenible a largo plazo.

**[VISUAL]** Diapositiva: stack tecnologico backend con iconos.

**GUSTAVO:**
> El stack del servidor se construyo con Node.js y Express en TypeScript, para prevenir errores en compilacion. Usamos PostgreSQL como motor relacional y Sequelize como ORM. La seguridad se implemento con JWT para autenticacion, refresh tokens de 7 dias, cifrado AES-256-GCM para datos personales, validacion estricta con Zod, y Helmet para cabeceras HTTP. Finalmente, se automatizo el pipeline de CI/CD con GitHub Actions.

### 2:55 - 3:50 | Solucion de frontend (German)

**[VISUAL]** Diapositiva: diagrama de componentes del frontend.

**GERMAN:**
> Para el frontend, el reto era distinto: habia que reducir la carga cognitiva del personal de seguridad, que opera bajo presion en las garitas. Seleccionamos React 18 con TypeScript, Vite como empaquetador de alto rendimiento y Tailwind CSS para el diseno adaptativo. La gestion de estado del servidor se resolvio con React Query, y la actualizacion en tiempo real mediante Server-Sent Events.

**[VISUAL]** Diapositiva: stack tecnologico frontend con iconos.

**GERMAN:**
> Para la captura de fotografias biomometricas integramos la Web API de camara con react-webcam. Implementamos sanitizacion contra ataques XSS con DOMPurify, graficos interactivos con Chart.js, y exportacion de reportes nativos en PDF con jsPDF y Excel con ExcelJS. Por ultimo, para garantizar un despliegue aislado en los puestos de control sin depender de navegadores comerciales, empaquetamos toda la aplicacion como un ejecutable de escritorio nativo con Electron.

---

## BLOQUE 3 — Desarrollo y Demostracion (3:50 - 5:00)

### 3:50 - 4:15 | Codigo clave del backend (screencast)

**[VISUAL]** Screencast: VS Code abierto, fuente grande (minimo 18px).
Mostrar `server/src/application/usecases/CheckInVisitor.usecase.ts`.

**GUSTAVO:**
> Aqui podemos ver el caso de uso CheckInVisitor, que pertenece a la capa de aplicacion. Noten como la logica de negocio no depende directamente de Sequelize ni de Express. El caso de uso recibe un repositorio inyectado mediante interfaces, lo que nos permite probarlo de forma aislada sin una base de datos real.

**[VISUAL]** Cambiar a `server/src/utils/Encryption.ts` o mostrar el cifrado AES-256-GCM.

**GUSTAVO:**
> Este es el modulo de cifrado AES-256-GCM. Cada cedula y dato personal se cifra antes de persistir y se descifra solo cuando el usuario autorizado lo solicita. La cedula ademas se hashea para permitir busquedas rapidas sin exponer el dato original.

### 4:15 - 4:45 | Sistema funcionando - flujo del operador

**[VISUAL]** Screencast: navegador con la aplicacion corriendo.
Login como operador (usar credenciales demo, NO reales).

**GERMAN:**
> Ahora veamos el sistema en vivo. Iniciamos sesion como operador. El sistema nos presenta el wizard de check-in guiado por pasos. En el paso 1, buscamos al visitante por cedula. Si ya existe, cargamos sus datos y foto previa. Si no existe, lo registramos.

**[VISUAL]** Completar el wizard: paso 2 (datos empresa), paso 3 (vehiculo), paso 4 (motivo + foto).

**GERMAN:**
> Avanzamos por los pasos: datos de la empresa, informacion del vehiculo si aplica, y finalmente el detalle de la visita con el motivo, el consentimiento y la captura fotografica. El operador puede registrar la entrada o poner la visita en espera.

### 4:45 - 5:00 | Dashboard admin y auditoria

**[VISUAL]** Cambiar a sesion admin o root. Mostrar AdminDashboard con graficos.

**GERMAN:**
> Cambiamos al panel de administracion. Aqui vemos las metricas en tiempo real con Chart.js: visitas activas, comparativas mensuales y alertas de check-out omitido. Todo se actualiza automaticamente via Server-Sent Events sin recargar la pagina. Tambien contamos con el panel de auditoria, donde se registran todas las operaciones con IP, usuario y marca de tiempo.

---

## BLOQUE 4 — Resultados, Conclusiones y Recomendaciones (5:00 - 6:40)

### 5:00 - 5:50 | Resultados e impacto

**[VISUAL]** Volver a camara. Ambos en cuadro.
Diapositiva con metricas de impacto.

**GUSTAVO:**
> Los resultados fueron concretos. Se automatizo por completo un proceso que antes era manual en papel. El tiempo de registro de un visitante paso de varios minutos a menos de 30 segundos gracias al wizard guiado. Se centralizo la informacion en una base de datos PostgreSQL con cifrado de grado militar, eliminando el riesgo de exposicion de datos personales. Y se logro trazabilidad total: cada operacion queda registrada en el log de auditoria con IP, usuario y timestamp.

**GERMAN:**
> Desde el lado del frontend, el impacto fue operativo. Los guardias completan registros en segundos sin formularios extensos. La sincronizacion en tiempo real via SSE permite que todas las garitas vean el mismo estado sin recargar. Y el empaquetado con Electron nos dio un ejecutable nativo que no depende del navegador, evitando cierres accidentales.

### 5:50 - 6:25 | Competencias aplicadas y conclusiones

**[VISUAL]** Diapositiva: competencias aplicadas (lista).

**GUSTAVO:**
> Las competencias aplicadas incluyen arquitectura de software con Clean Architecture, seguridad informatica con cifrado simetrico y gestion de tokens, diseno de API REST, testing automatizado con Vitest, y CI/CD con GitHub Actions. La leccion mas importante fue entender que la seguridad no es un anadido final, sino un requerimiento transversal que se disena desde la primera linea de codigo.

**GERMAN:**
> Por mi parte, aplique patrones de diseno de componentes, gestion de estado asincrono con React Query, integracion con hardware via Web API, prevencion de ataques XSS, y empaquetado de aplicaciones de escritorio. La mayor leccion fue que la ingenieria es, ante todo, resolver problemas reales de usuarios que trabajan bajo presion. Un sistema perfecto en pruebas no sirve si no se adapta a la realidad operativa de una planta industrial.

### 6:25 - 6:40 | Recomendaciones

**[VISUAL]** Diapositiva: recomendaciones (3 bullets).

**GUSTAVO:**
> Como recomendaciones a la empresa, sugerimos implementar monitoreo con Prometheus y Grafana, evaluar orquestacion con Kubernetes para escalabilidad futura, y establecer rotacion trimestral de claves de cifrado.

**GERMAN:**
> A la universidad, recomendamos integrar talleres de DevOps, enfocarse en arquitecturas desacopladas en lugar de monolitos simples, y vincular los proyectos finales con problemas reales de empresas de la region.

---

## BLOQUE 5 — Cierre (6:40 - 7:00)

**[VISUAL]** Camara. Ambos en cuadro. Diapositiva de cierre con logos.

**GUSTAVO:**
> Agradecemos a la Industria de Alimentos El Trebol por abrirnos las puertas, al T.S.U. Jose Romero por su acompanamiento como tutor empresarial, y al Ing. Victor Rojas por su guia academica.

**GERMAN:**
> Tambien agradecemos a la Universidad Nacional Experimental Romulo Gallegos, al Area de Ingenieria de Sistemas y a la Coordinacion de Pasantias por esta oportunidad de crecimiento profesional.

**GUSTAVO Y GERMAN (al unisono):**
> Muchas gracias.

**[VISUAL]** Fundido a negro. Logo UNERG + El Trebol + LogMaster.

---

## Checklist de grabacion

- [ ] Uniforme de pasantias AIS (sin gorras, sin escudos, sin escotes)
- [ ] Micromano manos libres o solapa, ambiente sin eco
- [ ] Resolucion 1080p, 16:9 horizontal
- [ ] Fuente del editor minimo 18px al mostrar codigo
- [ ] Usar credenciales DEMO (demo / Demo123!@#), NUNCA reales
- [ ] No mostrar .env, JWT_SECRET, ENCRYPTION_KEY ni claves reales
- [ ] Datos de prueba (mock data) en la demostracion
- [ ] Diapositivas: poco texto, mas diagramas
- [ ] No leer las diapositivas, hablar con fluidez
- [ ] Exportar MP4 H.264 + AAC
- [ ] Subir al grupo de Telegram: https://t.me/+Nz0nfSr18pAxZjUx
- [ ] Fecha limite: Miercoles 15 de Julio (San Juan de los Morros)
