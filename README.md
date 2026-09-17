# Enlaces de reseña de Google → NFC

Herramienta web interna para generar, desde el móvil y en pocos segundos, el
**enlace directo al formulario de reseña de Google** de cualquier negocio, listo
para grabarlo en una placa NFC.

Está pensada para usarse en visitas comerciales: se busca el establecimiento por
nombre, se confirma que es el correcto (dirección y localidad a la vista), se
copia el enlace y se comprueba abriéndolo antes de grabar la placa.

```
Buscar «Bar Catalunya» → elegir el establecimiento → Place ID
                       → https://search.google.com/local/writereview?placeid=PLACE_ID
```

---

## 1. Qué hace

- **Búsqueda de establecimientos** por texto libre con **Places API (New)**,
  sesgada geográficamente a **Terrassa (Barcelona, España)** sin excluir los
  municipios vecinos.
- **Resultados priorizados**: primero los de Terrassa, después los que caen
  dentro del radio de sesgo y por último el resto, conservando en cada grupo el
  orden de relevancia de Google.
- Cada resultado muestra **nombre, dirección completa, localidad**, tipo de
  negocio, distancia al centro del sesgo y un aviso si Google lo marca como
  **cerrado permanentemente**.
- Al seleccionar un negocio se muestra su **Place ID** y el **enlace de reseña**
  generado, con acciones de **copiar enlace**, **copiar Place ID**,
  **abrir enlace**, **compartir** (Web Share API) y **código QR**.
- **Historial local** de los últimos negocios consultados (`localStorage`), con
  botón para borrarlo. Reabrir una entrada del historial no consume llamadas a
  la API.
- **Detección opcional de ubicación** del dispositivo para priorizar por
  proximidad cuando estás delante del establecimiento.
- **Caché de búsquedas y contador de uso**, para que la herramienta se mantenga
  dentro del nivel gratuito de Google (ver el apartado 4).
- **Estados explícitos** de carga, sin resultados, error de API, API key
  rechazada y problema de conexión, con reintento.

### Stack

HTML + CSS + JavaScript vanilla con módulos ES. Sin frameworks, sin build, sin
backend. La única dependencia es `vendor/qrcode.js` (MIT), que se descarga de
forma diferida y sólo cuando se despliega el código QR.

### Estructura

```
.
├── index.html            Las cuatro vistas de la aplicación
├── css/
│   └── styles.css        Hoja única, mobile-first, tema claro/oscuro
├── js/
│   ├── app.js            Orquestación, navegación y eventos de la interfaz
│   ├── config.js         Configuración (sesgo geográfico, idioma, API key)
│   ├── apikey.js         Resolución y persistencia de la API key
│   ├── places.js         Carga de Maps JS API, búsqueda y normalización
│   ├── review.js         Validación del Place ID y construcción del enlace
│   ├── history.js        Historial local
│   ├── cache.js          Caché de búsquedas (evita llamadas repetidas)
│   ├── usage.js          Contador local de llamadas consumidas
│   └── qr.js             Generación diferida del código QR
├── vendor/
│   └── qrcode.js         Generador de QR (MIT, Kazuhiko Arase)
├── .nojekyll             Evita el procesado de Jekyll en GitHub Pages
└── README.md
```

---

## 2. Cómo ejecutarla localmente

La aplicación usa módulos ES y Maps JavaScript API, así que **no funciona
abriendo `index.html` con doble clic** (`file://`): hace falta servirla por HTTP.

```bash
git clone https://github.com/Bitrok/NFC.git
cd NFC
python3 -m http.server 8000
```

Abre <http://localhost:8000>. Cualquier servidor estático sirve
(`npx serve`, `php -S localhost:8000`, etc.).

Para que la búsqueda funcione en local, el origen que uses debe estar autorizado
en las restricciones de la API key (ver el paso 6).

---

## 3. Qué API de Google usa y por qué

Google mantiene dos generaciones de Places. Las clases heredadas
(`PlacesService`, `AutocompleteService`) están en modo de mantenimiento y Google
recomienda **Places API (New)** para todo desarrollo nuevo.

Esta aplicación usa **Text Search (New)** a través de la librería `places` de
**Maps JavaScript API**:

```js
const { Place } = await google.maps.importLibrary('places');
const { places } = await Place.searchByText({
  textQuery: 'Bar Catalunya',
  fields: ['displayName', 'formattedAddress', 'addressComponents',
           'location', 'businessStatus', 'primaryTypeDisplayName'],
  locationBias: { center: { lat: 41.5630, lng: 2.0087 }, radius: 12000 },
  language: 'es',
  region: 'es',
  maxResultCount: 12,
});
```

Motivos de esta elección:

- **`Place.searchByText` devuelve en una sola llamada** el nombre, la dirección
  y los componentes de dirección de todos los resultados. Con Autocomplete
  harían falta llamadas adicionales por cada candidato para obtener la
  localidad.
- Al ir a través de Maps JavaScript API, **la API key viaja en un contexto de
  navegador con cabecera `Referer`**, que es lo que permite restringirla por
  referente HTTP. No hay problemas de CORS ni necesidad de proxy.
- Se usa **`locationBias`, no `locationRestriction`**: los resultados de
  Terrassa suben, pero los de Sabadell, Matadepera o Barcelona siguen
  apareciendo si son la mejor coincidencia.

El sesgo geográfico, el idioma, el radio y el número de resultados se ajustan en
[`js/config.js`](js/config.js). El apartado 4 detalla por qué esta combinación de
campos es también la más barata posible sin perder la información que hace falta
para identificar el negocio.

---

## 4. Coste: cómo mantenerlo en 0 €

Resumen: **prueba con la vía B** (Maps Demo Key, sin tarjeta) y, si adoptas la
herramienta para el trabajo diario, **pásate a la vía A** (clave estándar con
tope de cuota). Ambas cuestan 0 €; la diferencia está en las garantías.

### Qué se factura exactamente

La aplicación **no instancia ningún mapa**: sólo carga la librería `places` y
llama a `Place.searchByText`. El SKU «Dynamic Maps» de Maps JavaScript API se
factura por *carga de mapa*, así que aquí no se activa. El único evento
facturable es **una llamada de Text Search por búsqueda**.

Los campos que pide la aplicación (`displayName`, `formattedAddress`,
`addressComponents`, `location`, `businessStatus`, `primaryTypeDisplayName`)
sitúan la petición en el SKU **Text Search Pro**, que incluye **5.000 llamadas
gratuitas al mes**. No se puede bajar de ese SKU: el nivel inferior
(«Essentials IDs Only») sólo devuelve identificadores, sin nombre ni dirección,
con lo que sería imposible distinguir el negocio correcto.

Un uso realista de visitas comerciales (50 búsquedas al día) son unas 1.500
llamadas al mes: **menos de un tercio del margen gratuito**.

Además, la aplicación reduce el consumo por su cuenta:

- **Caché de búsquedas** (12 h): repetir la misma consulta, volver atrás o
  reintentar tras un error no gasta ninguna llamada.
- **Historial local**: reabrir un negocio ya consultado no llama a la API.
- **Contador visible** en la pantalla de búsqueda con las llamadas de hoy y del
  mes, que se pone en rojo al llegar al 80 % del límite configurado en
  [`js/config.js`](js/config.js).

### Vía A — Clave estándar (0 € garantizado, pero con tarjeta)

Google exige una cuenta de facturación con método de pago para emitir una clave
estándar, **aunque no llegues a pagar nunca**. Para que no haya ninguna
sorpresa, pon topes duros:

1. *APIs y servicios* → **Places API (New)** → **Cuotas**: límite de, por
   ejemplo, **150 peticiones al día** (unas 4.500 al mes, por debajo de las
   5.000 gratuitas). Al alcanzarlo, Google devuelve error en lugar de cobrar.
2. *Facturación* → **Presupuestos y alertas**: presupuesto de 1 € con avisos por
   correo. Sirve de red de seguridad, no de límite.

Con el tope diario por debajo del margen gratuito, es **matemáticamente
imposible** generar factura.

### Vía B — Maps Demo Key (sin tarjeta)

Si no quieres dar ninguna tarjeta, Google ofrece la **Maps Demo Key**: se
obtiene con sólo una cuenta de Google en
<https://developers.google.com/maps/demo-key>, sin cuenta de facturación y sin
método de pago.

- Soporta **Maps JavaScript API** y **Text Search** de Places, que es
  exactamente lo que usa esta aplicación: **funciona sin tocar el código**.
- Tiene un **límite diario por API** (del orden de 100 llamadas al día). Al
  alcanzarlo el uso se pausa hasta el día siguiente **sin riesgo de cargo**.
- No expone contenido generado por usuarios (fotos y reseñas), algo que esta
  aplicación no necesita.
- Si más adelante quieres pasar a la vía A, basta con **añadir facturación a esa
  misma clave** desde Cloud Console; no hay que tocar código ni reconfigurar la
  aplicación.

**Lo que hay que saber antes de depender de ella.** No caduca por fecha, pero
sus [términos de servicio](https://cloud.google.com/terms/maps-platform/demo-project-terms)
son explícitos:

- «El uso en producción está estrictamente prohibido»: es una clave para
  evaluar y probar.
- Google puede «aplicar, ajustar o poner a cero estos límites de uso en
  cualquier momento sin avisar».
- Google se reserva el derecho de «suspender o cancelar el acceso en cualquier
  momento, por cualquier motivo, sin aviso previo ni responsabilidad».
- No hay SLA ni soporte: ninguna garantía de disponibilidad.

Es decir: el riesgo no es que expire, es que **deje de funcionar sin aviso en el
momento menos oportuno**, delante de un cliente. Sirve perfectamente para la
prueba inicial; para el uso diario conviene la vía A, que cuesta lo mismo (0 €)
y añade restricción por dominio y límites estables.

> Con el `freeTier` de [`js/config.js`](js/config.js) ajustas el umbral del aviso
> del contador: `{ perDay: 100, perMonth: 5000 }` viene pensado para la Demo Key;
> con clave estándar puedes subir `perDay`.

### APIs que hay que habilitar (vía A)

En [Google Cloud Console](https://console.cloud.google.com/) → *APIs y
servicios* → *Biblioteca*:

| API | Para qué |
|-----|----------|
| **Maps JavaScript API** | Cargar el runtime y la librería `places` en el navegador |
| **Places API (New)** | Ejecutar Text Search (New) |

No hace falta activar la Places API heredada. Con la Demo Key no tienes que
habilitar nada: ya viene con esos productos activos.

---

## 5. Cómo crear la API key

> Sólo para la **vía A**. Con la Maps Demo Key la clave te la da directamente
> <https://developers.google.com/maps/demo-key> y puedes saltar al apartado 7.

1. **APIs y servicios** → **Credenciales**.
2. **Crear credenciales** → **Clave de API**.
3. Copia la clave (`AIza...`) y pulsa **Editar clave** para restringirla
   inmediatamente, antes de usarla.

Usa **una clave dedicada a esta aplicación**. Así, si hay que rotarla, no afecta
a nada más.

---

## 6. Cómo restringir la API key

Esta es la parte importante: la aplicación es un frontend estático y público, así
que la clave **es visible para cualquiera que la use**. La protección no consiste
en esconderla, sino en que **no sirva para nada fuera de este sitio** y en que
**no pueda generar un gasto significativo**.

> La Maps Demo Key no se administra como una clave propia, así que no admite
> estas restricciones; su protección es el tope diario impuesto por Google. Si
> usas la Demo Key, salta al apartado 7.

### 6.1 Restricción de aplicación: referentes HTTP

En **Editar clave** → **Restricciones de la aplicación** → **Sitios web**, añade:

| Entorno | Referente |
|---------|-----------|
| GitHub Pages | `https://bitrok.github.io/*` |
| Desarrollo local | `http://localhost:8000/*` |
| Desarrollo local | `http://127.0.0.1:8000/*` |

**Ten en cuenta esta limitación real:** los navegadores modernos aplican por
defecto la política `strict-origin-when-cross-origin`, por lo que en las
peticiones a Google sólo envían el **origen** (`https://bitrok.github.io/`), no
la ruta completa. Una restricción del tipo `https://bitrok.github.io/NFC/*`
puede por tanto **rechazar peticiones legítimas**. Y como los *project sites* de
GitHub Pages comparten el origen `https://<usuario>.github.io`, el referente no
se puede acotar más allá de la cuenta de GitHub.

Si esa granularidad no es suficiente, la alternativa es publicar en un
**dominio propio** apuntado a GitHub Pages y restringir la clave a ese dominio.

### 6.2 Restricción de API

En la misma pantalla → **Restricciones de API** → **Restringir clave**, y
selecciona **sólo**:

- Maps JavaScript API
- Places API (New)

Con esto, aunque alguien extraiga la clave no podrá usarla para Geocoding,
Directions, Routes ni ninguna otra API de pago del proyecto.

### 6.3 Límites de gasto

Las restricciones anteriores se pueden eludir falsificando la cabecera `Referer`
desde fuera de un navegador. El control que realmente acota el daño es la cuota
diaria, y es el mismo mecanismo que garantiza el coste cero: está explicado en
el **apartado 4**. Con la Maps Demo Key el tope ya viene impuesto por Google.

### 6.4 Por qué no hay backend

Un proxy en un servidor propio sería la única forma de ocultar la clave por
completo, pero implica desplegar y mantener infraestructura para una herramienta
de uso interno y esporádico. Con la clave restringida a dos APIs, acotada al
origen de publicación y con tope diario de peticiones, el riesgo residual es un
consumo de cuota limitado y acotado en coste. Se ha considerado un intercambio
razonable frente a añadir un servicio que mantener.

Si en algún momento ese riesgo deja de ser aceptable, el punto de cambio está
localizado en un único archivo: [`js/places.js`](js/places.js) sólo necesitaría
llamar a tu proxy en lugar de a Maps JavaScript API.

---

## 7. Dónde se introduce la clave

Hay dos opciones. **La primera es la recomendada** y es la única que mantiene la
clave fuera del repositorio.

### Opción A (recomendada): en el propio dispositivo

No toques ningún archivo. Abre la aplicación, pega la clave en la pantalla
**«Configurar API key»** y pulsa **Guardar y continuar**.

- La clave queda en el `localStorage` del navegador de ese dispositivo.
- **No se publica en GitHub Pages ni se sube al repositorio.**
- Se cambia o se elimina desde el botón de ajustes (arriba a la derecha).
- Hay que introducirla una vez en cada dispositivo o navegador que use la
  herramienta.

### Opción B: en `js/config.js`

Sólo si el repositorio es privado o si aceptas publicar la clave:

```js
export const CONFIG = {
  apiKey: 'AIza...',
  // ...
};
```

Con `apiKey` rellenado, la aplicación no pide la clave y la pantalla de ajustes
queda en modo informativo. **El archivo se publica tal cual en GitHub Pages**,
así que las restricciones del paso 6 pasan a ser obligatorias.

> El repositorio se entrega con `apiKey: ''`. No contiene ninguna clave real.

---

## 8. Cómo activar GitHub Pages

1. Sube el contenido a la rama que quieras publicar.
2. En GitHub: **Settings** → **Pages**.
3. **Build and deployment** → **Source**: `Deploy from a branch`.
4. **Branch**: la rama elegida (por ejemplo `main`) y carpeta **`/ (root)`**.
5. **Save**. En un par de minutos la aplicación estará en
   `https://bitrok.github.io/NFC/`.
6. Añade ese origen a los referentes autorizados de la clave (paso 6.1) si no lo
   has hecho ya.

El archivo `.nojekyll` de la raíz desactiva el procesado de Jekyll: GitHub Pages
publica los archivos tal cual, sin transformarlos.

---

## 9. Cómo comprobar que el enlace funciona

Antes de grabar una placa NFC:

1. Busca el negocio y selecciónalo.
2. Comprueba que **nombre, dirección y localidad** son los del establecimiento
   que tienes delante.
3. Pulsa **Abrir enlace**. Debe abrirse el formulario de reseña de Google **con
   el nombre del negocio correcto** y las cinco estrellas.
   - Si aparece el diálogo de inicio de sesión, es normal: la reseña requiere
     cuenta de Google. Tras iniciar sesión debe verse el negocio correcto.
   - Si aparece otro negocio, el Place ID no es el que buscabas: vuelve atrás y
     elige otro resultado.
   - Si Google responde que la página no existe, el Place ID puede estar
     obsoleto (negocio eliminado o fusionado en Maps). Repite la búsqueda para
     obtener el identificador vigente.
4. **No escribas ninguna reseña de prueba.** Cierra la pestaña una vez
   verificado.
5. Pulsa **Copiar enlace** (espera la confirmación «✓ Copiado») y pégalo en tu
   aplicación de escritura NFC como registro de tipo **URL/URI**.
6. Lee la placa con el móvil para confirmar que abre el mismo formulario.

---

## Solución de problemas

| Síntoma | Causa probable |
|---------|----------------|
| **«API key rechazada»** | La clave es incorrecta, le falta alguna de las dos APIs, o el origen actual no está en los referentes autorizados. El detalle del error indica el origen desde el que se ha llamado. |
| **«Google Places ha devuelto un error»** | Places API (New) no está habilitada, la facturación no está activa o se ha agotado la cuota diaria. |
| **Error de API a mitad del día** | Con la Maps Demo Key, tope diario agotado: se reanuda al día siguiente sin cargo. Con clave estándar, revisa la cuota del apartado 4. |
| **«Problema de conexión»** | Sin red, o un bloqueador de contenido impide cargar `maps.googleapis.com`. |
| **Sin resultados** | Prueba con el nombre completo y la localidad: «Bar Catalunya Terrassa». |
| **No copia al portapapeles** | El portapapeles requiere HTTPS (o `localhost`). En `http://` con IP, mantén pulsado el enlace y cópialo a mano. |
| **La búsqueda no arranca en local** | `index.html` abierto como `file://`. Sírvelo por HTTP (paso 2). |

---

## Licencia

Código propio: MIT (ver [`LICENSE`](LICENSE)).
`vendor/qrcode.js`: MIT, © 2009 Kazuhiko Arase.
