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
[`js/config.js`](js/config.js).

---

## 4. APIs que hay que activar

En [Google Cloud Console](https://console.cloud.google.com/) → **APIs y
servicios** → **Biblioteca**, con un proyecto que tenga **facturación
habilitada** (Places API (New) la exige, aunque el uso de esta herramienta cabe
sobradamente en el crédito mensual gratuito de Google Maps Platform):

| API | Para qué |
|-----|----------|
| **Maps JavaScript API** | Cargar el runtime y la librería `places` en el navegador |
| **Places API (New)** | Ejecutar Text Search (New) |

> No hace falta activar la Places API heredada. Si el proyecto es nuevo, Google
> sólo ofrecerá la versión «(New)».

---

## 5. Cómo crear la API key

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

### 6.3 Límites de gasto (no lo omitas)

Las restricciones anteriores se pueden eludir falsificando la cabecera `Referer`
desde fuera de un navegador. El control que realmente acota el daño es la cuota:

1. **APIs y servicios** → **Places API (New)** → **Cuotas**: fija un límite
   diario de peticiones acorde a tu uso (por ejemplo 200/día).
2. Haz lo mismo con **Maps JavaScript API**.
3. **Facturación** → **Presupuestos y alertas**: crea un presupuesto con avisos
   por correo.

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
| **«Problema de conexión»** | Sin red, o un bloqueador de contenido impide cargar `maps.googleapis.com`. |
| **Sin resultados** | Prueba con el nombre completo y la localidad: «Bar Catalunya Terrassa». |
| **No copia al portapapeles** | El portapapeles requiere HTTPS (o `localhost`). En `http://` con IP, mantén pulsado el enlace y cópialo a mano. |
| **La búsqueda no arranca en local** | `index.html` abierto como `file://`. Sírvelo por HTTP (paso 2). |

---

## Licencia

Código propio: MIT (ver [`LICENSE`](LICENSE)).
`vendor/qrcode.js`: MIT, © 2009 Kazuhiko Arase.
