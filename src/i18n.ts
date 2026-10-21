// Interface texts in English, Spanish and Catalan. Each message is [en, es, ca]; `{name}`
// placeholders are filled in by t(). The language comes from ?lang=, then the choice saved in
// the browser (shared with the rest of the site under the same address), then the browser's
// own languages.

export const LANGS = ['en', 'es', 'ca'] as const;
export type Lang = (typeof LANGS)[number];

const LANG_NAMES: Record<Lang, string> = { en: 'English', es: 'Español', ca: 'Català' };
const LOCALES: Record<Lang, string> = { en: 'en-GB', es: 'es-ES', ca: 'ca-ES' };

type Msg = readonly [string, string, string];

const M = {
  // App and header
  'app.title': ['Planetarium', 'Planetario', 'Planetari'],
  'app.loading': ['Loading the sky…', 'Cargando el cielo…', 'Carregant el cel…'],
  'app.error': ['Could not start: {error}', 'No se ha podido iniciar: {error}', "No s'ha pogut iniciar: {error}"],
  'clock.browser': ['(browser time)', '(hora del navegador)', '(hora del navegador)'],
  'clock.sun': ['Sun {alt}', 'Sol {alt}', 'Sol {alt}'],
  'top.search': ['Search (/)', 'Buscar (/)', 'Cercar (/)'],
  'top.settings': ['Settings', 'Ajustes', 'Configuració'],
  'top.guide': ['Quick guide', 'Guía rápida', 'Guia ràpida'],
  'search.placeholder': ['Search: Jupiter, M31, Vega…', 'Buscar: Júpiter, M31, Vega…', 'Cerca: Júpiter, M31, Vega…'],
  'search.aria': ['Search the sky', 'Buscar en el cielo', 'Cercar al cel'],
  'search.below': ['below the horizon', 'bajo el horizonte', "sota l'horitzó"],
  'search.moon': ['Our satellite', 'Nuestro satélite', 'El nostre satèl·lit'],
  'day.hint': ['Daylight hides the stars.', 'La luz del día oculta las estrellas.', 'La llum del dia amaga les estrelles.'],
  'day.tonight': ["See tonight's sky", 'Ver el cielo de esta noche', "Veure el cel d'aquesta nit"],

  // Time bar
  'time.controls': ['Time controls', 'Control del tiempo', 'Control del temps'],
  'time.slower': ['Slower or backwards', 'Más lento o hacia atrás', 'Més lent o enrere'],
  'time.play': ['Play or pause (space)', 'Reproducir o pausar (espacio)', 'Reproduir o aturar (espai)'],
  'time.faster': ['Faster', 'Más rápido', 'Més ràpid'],
  'time.now': ['Now', 'Ahora', 'Ara'],
  'time.nowTitle': ['Back to the current time', 'Volver a la hora actual', "Tornar a l'hora actual"],
  'time.paused': ['Paused', 'En pausa', 'En pausa'],
  'speed.0': ['−1 day/s', '−1 día/s', '−1 dia/s'],
  'speed.1': ['−1 h/s', '−1 h/s', '−1 h/s'],
  'speed.2': ['−10 min/s', '−10 min/s', '−10 min/s'],
  'speed.3': ['−1 min/s', '−1 min/s', '−1 min/s'],
  'speed.4': ['Real time', 'Tiempo real', 'Temps real'],
  'speed.5': ['1 min/s', '1 min/s', '1 min/s'],
  'speed.6': ['10 min/s', '10 min/s', '10 min/s'],
  'speed.7': ['1 h/s', '1 h/s', '1 h/s'],
  'speed.8': ['1 day/s', '1 día/s', '1 dia/s'],
  'scope.button': ['Telescope', 'Telescopio', 'Telescopi'],
  'scope.buttonTitle': ['Telescope view (T)', 'Vista de telescopio (T)', 'Vista de telescopi (T)'],
  'scope.prev': ['Previous target ([)', 'Objetivo anterior ([)', 'Objectiu anterior ([)'],
  'scope.next': ['Next target (])', 'Siguiente objetivo (])', 'Objectiu següent (])'],
  'scope.target': ['Telescope target', 'Objetivo del telescopio', 'Objectiu del telescopi'],
  'scope.nothing': ['Nothing bright is up', 'No hay nada brillante a la vista', 'No hi ha res brillant a la vista'],

  // Equipment panel
  'gear.aria': ['Telescope and eyepiece', 'Telescopio y ocular', 'Telescopi i ocular'],
  'gear.telescope': ['Telescope', 'Telescopio', 'Telescopi'],
  'gear.eyepiece': ['Eyepiece', 'Ocular', 'Ocular'],
  'gear.barlow': ['Barlow lens', 'Lente de Barlow', 'Lent de Barlow'],
  'gear.none': ['None', 'Ninguna', 'Cap'],
  'gear.custom': ['Custom telescope', 'Telescopio personalizado', 'Telescopi personalitzat'],
  'gear.customOption': ['Custom telescope…', 'Telescopio personalizado…', 'Telescopi personalitzat…'],
  'gear.customNote': [
    'Set the aperture and focal length of your own telescope.',
    'Ajusta la apertura y la distancia focal de tu telescopio.',
    "Ajusta l'obertura i la distància focal del teu telescopi.",
  ],
  'gear.aperture': ['Aperture', 'Apertura', 'Obertura'],
  'gear.focal': ['Focal length', 'Distancia focal', 'Distància focal'],
  'gear.design': ['Design', 'Diseño', 'Disseny'],
  'gear.eyepieceTitle': ['{name}, {afov}° apparent field', '{name}, campo aparente de {afov}°', '{name}, camp aparent de {afov}°'],
  'group.binoculars': ['Binoculars', 'Prismáticos', 'Prismàtics'],
  'group.refractors': ['Refractors', 'Refractores', 'Refractors'],
  'group.reflectors': ['Reflectors', 'Reflectores', 'Reflectors'],
  'group.catadioptrics': ['Catadioptrics', 'Catadióptricos', 'Catadiòptrics'],
  'design.achromat': ['Achromatic refractor', 'Refractor acromático', 'Refractor acromàtic'],
  'design.apochromat': ['Apochromatic refractor', 'Refractor apocromático', 'Refractor apocromàtic'],
  'design.newtonian': ['Newtonian reflector', 'Reflector newtoniano', 'Reflector newtonià'],
  'design.maksutov': ['Maksutov-Cassegrain', 'Maksutov-Cassegrain', 'Maksutov-Cassegrain'],
  'design.sct': ['Schmidt-Cassegrain', 'Schmidt-Cassegrain', 'Schmidt-Cassegrain'],
  'design.binocular': ['Binoculars', 'Prismáticos', 'Prismàtics'],
  'eyepiece.plossl': ['{mm} mm Plössl', 'Plössl de {mm} mm', 'Plössl de {mm} mm'],
  'eyepiece.wide': ['{mm} mm wide-angle', 'Gran angular de {mm} mm', 'Gran angular de {mm} mm'],
  'eyepiece.plain': ['{mm} mm', '{mm} mm', '{mm} mm'],
  'read.mag': ['Magnification', 'Aumentos', 'Augments'],
  'read.useful': ['Useful {lo}–{hi}×', 'Útil {lo}–{hi}×', 'Útil {lo}–{hi}×'],
  'read.field': ['True field', 'Campo real', 'Camp real'],
  'read.moons': ['{n} full Moons across', '{n} lunas llenas de ancho', "{n} llunes plenes d'amplada"],
  'read.moonPart': ['{n}% of the Moon', '{n} % de la Luna', '{n} % de la Lluna'],
  'read.pupil': ['Exit pupil', 'Pupila de salida', 'Pupil·la de sortida'],
  'read.nebulae': ['Nebulae at {n}% brightness', 'Nebulosas al {n} % de brillo', 'Nebuloses al {n} % de brillantor'],
  'read.faintest': ['Faintest stars', 'Estrellas más débiles', 'Estrelles més febles'],
  'read.light': ['{n}× the light of your eye', '{n}× la luz de tu ojo', '{n}× la llum del teu ull'],
  'read.resolution': ['Resolution', 'Resolución', 'Resolució'],
  'read.double': ['Closest double star it splits', 'Estrella doble más cerrada que separa', 'Estrella doble més tancada que separa'],
  'advice.over': [
    'More magnification than this aperture can use: the image only gets dimmer and softer. Use a longer eyepiece.',
    'Más aumentos de los que esta apertura puede dar: la imagen solo se oscurece y se ablanda. Usa un ocular más largo.',
    "Més augments dels que aquesta obertura pot donar: la imatge només s'enfosqueix i s'estova. Fes servir un ocular més llarg.",
  ],
  'advice.wasted': [
    'The beam is wider than your pupil, so some light is wasted. Still a fine, wide view.',
    'El haz es más ancho que tu pupila y se pierde algo de luz. Aun así, es una buena vista amplia.',
    "El feix és més ample que la teva pupil·la i es perd una mica de llum. Tot i així, és una bona vista àmplia.",
  ],
  'advice.wide': [
    'Wide, bright view: ideal for star clusters, the Milky Way and big nebulae.',
    'Vista amplia y luminosa: ideal para cúmulos, la Vía Láctea y nebulosas grandes.',
    'Vista àmplia i lluminosa: ideal per a cúmuls, la Via Làctia i nebuloses grans.',
  ],
  'advice.medium': [
    'Bright, medium view: galaxies, nebulae and the whole Moon.',
    'Vista media y luminosa: galaxias, nebulosas y la Luna entera.',
    'Vista mitjana i lluminosa: galàxies, nebuloses i la Lluna sencera.',
  ],
  'advice.high': [
    'High power: planets, craters on the Moon and close double stars.',
    'Muchos aumentos: planetas, cráteres de la Luna y estrellas dobles cerradas.',
    'Molts augments: planetes, cràters de la Lluna i estrelles dobles tancades.',
  ],
  'advice.veryHigh': [
    'Very high power: only for steady nights and bright targets.',
    'Aumentos muy altos: solo para noches estables y objetos brillantes.',
    'Augments molt alts: només per a nits estables i objectes brillants.',
  ],
  'advice.spikes': [
    'Bright stars show four spikes from the secondary mirror’s supports.',
    'Las estrellas brillantes muestran cuatro puntas por los soportes del espejo secundario.',
    'Les estrelles brillants mostren quatre puntes pels suports del mirall secundari.',
  ],
  'advice.halo': [
    'Expect a violet halo around bright objects: this refractor is achromatic.',
    'Verás un halo violeta alrededor de los objetos brillantes: este refractor es acromático.',
    'Veuràs un halo violeta al voltant dels objectes brillants: aquest refractor és acromàtic.',
  ],

  // Settings panel
  'set.time': ['Date and time', 'Fecha y hora', 'Data i hora'],
  'set.datetime': ["Date and time (your browser's time zone)", 'Fecha y hora (zona horaria del navegador)', 'Data i hora (fus horari del navegador)'],
  'set.speed': ['Speed', 'Velocidad', 'Velocitat'],
  'set.location': ['Location', 'Lugar', 'Lloc'],
  'set.preset': ['Place', 'Sitio', 'Lloc'],
  'set.lat': ['Latitude', 'Latitud', 'Latitud'],
  'set.lon': ['Longitude', 'Longitud', 'Longitud'],
  'set.geolocate': ['Use my location', 'Usar mi ubicación', 'Fer servir la meva ubicació'],
  'set.locating': ['Locating…', 'Buscando tu ubicación…', 'Cercant la teva ubicació…'],
  'set.noGeo': ['Geolocation is not available.', 'La geolocalización no está disponible.', 'La geolocalització no està disponible.'],
  'set.geoError': ['Could not get your location ({error}).', 'No se ha podido obtener tu ubicación ({error}).', "No s'ha pogut obtenir la teva ubicació ({error})."],
  'set.darkness': ['Sky darkness', 'Oscuridad del cielo', 'Foscor del cel'],
  'set.display': ['Display', 'Qué mostrar', 'Què mostrar'],
  'set.milkyway': ['Milky Way', 'Vía Láctea', 'Via Làctia'],
  'set.deepsky': ['Galaxies, nebulae and clusters', 'Galaxias, nebulosas y cúmulos', 'Galàxies, nebuloses i cúmuls'],
  'set.lines': ['Constellation lines', 'Líneas de constelaciones', 'Línies de constel·lacions'],
  'set.cnames': ['Constellation names', 'Nombres de constelaciones', 'Noms de constel·lacions'],
  'set.snames': ['Star names', 'Nombres de estrellas', "Noms d'estrelles"],
  'set.atmosphere': ['Atmosphere and daylight', 'Atmósfera y luz del día', 'Atmosfera i llum del dia'],
  'set.ground': ['Ground', 'Suelo', 'Terra'],
  'set.telescope': ['Telescope', 'Telescopio', 'Telescopi'],
  'set.scope': ['Telescope view', 'Vista de telescopio', 'Vista de telescopi'],
  'set.orientation': [
    'Show the image as the eyepiece does (rotated or mirrored)',
    'Mostrar la imagen como el ocular (girada o en espejo)',
    "Mostrar la imatge com l'ocular (girada o en mirall)",
  ],
  'set.gearHint': [
    'Pick the telescope, eyepiece and Barlow in the equipment panel of the telescope view.',
    'El telescopio, el ocular y la Barlow se eligen en el panel de equipo de la vista de telescopio.',
    "El telescopi, l'ocular i la Barlow es trien al panell d'equip de la vista de telescopi.",
  ],
  'set.language': ['Language', 'Idioma', 'Idioma'],
  'set.help': [
    'Drag to look around · scroll or pinch to zoom · click an object for details. Keys: / search, arrows pan, +/− zoom, space pause, T telescope, [ ] previous/next target.',
    'Arrastra para mirar alrededor · rueda o pellizco para el zoom · pulsa un objeto para ver sus datos. Teclas: / buscar, flechas mover, +/− zoom, espacio pausa, T telescopio, [ ] objetivo anterior/siguiente.',
    "Arrossega per mirar al voltant · roda o pessic per al zoom · prem un objecte per veure'n les dades. Tecles: / cercar, fletxes moure, +/− zoom, espai pausa, T telescopi, [ ] objectiu anterior/següent.",
  ],
  'set.credits': [
    'Milky Way and Moon: NASA/GSFC. Planet maps: Solar System Scope (CC BY 4.0). Deep-sky data: OpenNGC (CC BY-SA 4.0). Stars: Yale Bright Star Catalogue.',
    'Vía Láctea y Luna: NASA/GSFC. Mapas de los planetas: Solar System Scope (CC BY 4.0). Cielo profundo: OpenNGC (CC BY-SA 4.0). Estrellas: Yale Bright Star Catalogue.',
    'Via Làctia i Lluna: NASA/GSFC. Mapes dels planetes: Solar System Scope (CC BY 4.0). Cel profund: OpenNGC (CC BY-SA 4.0). Estrelles: Yale Bright Star Catalogue.',
  ],
  'sky.0': ['Dark site (Bortle 2)', 'Cielo oscuro (Bortle 2)', 'Cel fosc (Bortle 2)'],
  'sky.1': ['Rural (Bortle 4)', 'Rural (Bortle 4)', 'Rural (Bortle 4)'],
  'sky.2': ['Suburban (Bortle 6)', 'Periurbano (Bortle 6)', 'Periurbà (Bortle 6)'],
  'sky.3': ['City (Bortle 8)', 'Ciudad (Bortle 8)', 'Ciutat (Bortle 8)'],
  'place.custom': ['Custom', 'Personalizado', 'Personalitzat'],
  'place.mine': ['My location', 'Mi ubicación', 'La meva ubicació'],
  'place.approx': ['{city} (from your time zone)', '{city} (según tu zona horaria)', '{city} (segons el teu fus horari)'],
  'place.greenwich': ['Greenwich Observatory', 'Observatorio de Greenwich', 'Observatori de Greenwich'],
  'place.madrid': ['Madrid', 'Madrid', 'Madrid'],
  'place.barcelona': ['Barcelona', 'Barcelona', 'Barcelona'],
  'place.lapalma': ['Roque de los Muchachos, La Palma', 'Roque de los Muchachos, La Palma', 'Roque de los Muchachos, La Palma'],
  'place.paris': ['Paris Observatory', 'Observatorio de París', 'Observatori de París'],
  'place.newyork': ['New York', 'Nueva York', 'Nova York'],
  'place.mexico': ['Mexico City', 'Ciudad de México', 'Ciutat de Mèxic'],
  'place.buenosaires': ['Buenos Aires', 'Buenos Aires', 'Buenos Aires'],
  'place.atacama': ['Atacama (ALMA)', 'Atacama (ALMA)', 'Atacama (ALMA)'],
  'place.maunakea': ['Mauna Kea', 'Mauna Kea', 'Mauna Kea'],
  'place.tokyo': ['Tokyo', 'Tokio', 'Tòquio'],
  'place.sydney': ['Sydney', 'Sídney', 'Sydney'],
  'place.reykjavik': ['Reykjavík', 'Reikiavik', 'Reykjavík'],

  // Info card
  'info.close': ['Close', 'Cerrar', 'Tancar'],
  'info.center': ['Center', 'Centrar', 'Centrar'],
  'info.observe': ['Observe', 'Observar', 'Observar'],
  'info.track': ['Track', 'Seguir', 'Seguir'],
  'info.star': ['Star', 'Estrella', 'Estrella'],
  'info.planet': ['Planet', 'Planeta', 'Planeta'],
  'info.sunNote': [
    'Star · never look at it through a telescope without a proper solar filter',
    'Estrella · nunca la mires con un telescopio sin un filtro solar adecuado',
    'Estrella · no la miris mai amb un telescopi sense un filtre solar adequat',
  ],
  'info.magnitude': ['Magnitude', 'Magnitud', 'Magnitud'],
  'info.colour': ['Colour index B−V', 'Índice de color B−V', 'Índex de color B−V'],
  'info.size': ['Size', 'Tamaño', 'Mida'],
  'info.apparent': ['Apparent size', 'Tamaño aparente', 'Mida aparent'],
  'info.distance': ['Distance', 'Distancia', 'Distància'],
  'info.lit': ['Illuminated', 'Iluminada', 'Il·luminada'],
  'info.radecJ2000': ['RA / Dec (J2000)', 'AR / Dec (J2000)', 'AR / Dec (J2000)'],
  'info.radecDate': ['RA / Dec (of date)', 'AR / Dec (de la fecha)', 'AR / Dec (de la data)'],
  'info.altitude': ['Altitude', 'Altura', 'Alçada'],
  'info.azimuth': ['Azimuth', 'Acimut', 'Azimut'],
  'info.below': ['(below horizon)', '(bajo el horizonte)', "(sota l'horitzó)"],
  'kind.galaxy': ['Galaxy', 'Galaxia', 'Galàxia'],
  'kind.globular': ['Globular cluster', 'Cúmulo globular', 'Cúmul globular'],
  'kind.open': ['Open cluster', 'Cúmulo abierto', 'Cúmul obert'],
  'kind.nebula': ['Nebula', 'Nebulosa', 'Nebulosa'],
  'kind.planetary': ['Planetary nebula', 'Nebulosa planetaria', 'Nebulosa planetària'],
  'kind.double': ['Double star', 'Estrella doble', 'Estrella doble'],
  'phase.new': ['New Moon', 'Luna nueva', 'Lluna nova'],
  'phase.full': ['Full Moon', 'Luna llena', 'Lluna plena'],
  'phase.firstQuarter': ['First Quarter', 'Cuarto creciente', 'Quart creixent'],
  'phase.lastQuarter': ['Last Quarter', 'Cuarto menguante', 'Quart minvant'],
  'phase.waxingCrescent': ['Waxing Crescent', 'Luna creciente', 'Lluna creixent'],
  'phase.waningCrescent': ['Waning Crescent', 'Luna menguante', 'Lluna minvant'],
  'phase.waxingGibbous': ['Waxing Gibbous', 'Gibosa creciente', 'Gibosa creixent'],
  'phase.waningGibbous': ['Waning Gibbous', 'Gibosa menguante', 'Gibosa minvant'],
  'body.sun': ['Sun', 'Sol', 'Sol'],
  'body.moon': ['Moon', 'Luna', 'Lluna'],
  'body.mercury': ['Mercury', 'Mercurio', 'Mercuri'],
  'body.venus': ['Venus', 'Venus', 'Venus'],
  'body.mars': ['Mars', 'Marte', 'Mart'],
  'body.jupiter': ['Jupiter', 'Júpiter', 'Júpiter'],
  'body.saturn': ['Saturn', 'Saturno', 'Saturn'],
  'body.uranus': ['Uranus', 'Urano', 'Urà'],
  'body.neptune': ['Neptune', 'Neptuno', 'Neptú'],
  'body.Io': ['Io', 'Ío', 'Io'],
  'body.Europa': ['Europa', 'Europa', 'Europa'],
  'body.Ganymede': ['Ganymede', 'Ganímedes', 'Ganímedes'],
  'body.Callisto': ['Callisto', 'Calisto', 'Cal·listo'],

  // Eyepiece caption
  'cap.barlow': ['+ ×{n} Barlow', '+ Barlow ×{n}', '+ Barlow ×{n}'],
  'cap.field': ['field {field}° · stars to mag {mag}', 'campo {field}° · estrellas hasta mag {mag}', 'camp {field}° · estrelles fins a mag {mag}'],
  'cap.catalogue': ['(catalogue complete to ~6.5)', '(catálogo completo hasta ~6,5)', '(catàleg complet fins a ~6,5)'],
  'cap.sun': [
    'Never point a telescope at the Sun without a certified solar filter!',
    '¡Nunca apuntes un telescopio al Sol sin un filtro solar certificado!',
    'No apuntis mai un telescopi al Sol sense un filtre solar certificat!',
  ],

  // Quick guide
  'guide.welcomeTitle': ['Welcome to the planetarium', 'Bienvenido al planetario', 'Benvingut al planetari'],
  'guide.welcome': [
    'This is the real sky right now from {place}. Want a 30-second tour?',
    'Este es el cielo real ahora mismo desde {place}. ¿Un recorrido de 30 segundos?',
    "Aquest és el cel real ara mateix des de {place}. Un recorregut de 30 segons?",
  ],
  'guide.start': ['Start the tour', 'Empezar', 'Començar'],
  'guide.skip': ['Skip', 'Saltar', 'Saltar'],
  'guide.next': ['Next', 'Siguiente', 'Següent'],
  'guide.back': ['Back', 'Atrás', 'Enrere'],
  'guide.done': ['Start exploring', 'A explorar', 'A explorar'],
  'guide.step': ['{n} of {total}', '{n} de {total}', '{n} de {total}'],
  'guide.skyTitle': ['Look around', 'Mira alrededor', 'Mira al voltant'],
  'guide.sky': [
    'Drag the sky to look around and scroll or pinch to zoom. Tap any star, planet or galaxy to see what it is. Try it now.',
    'Arrastra el cielo para mirar alrededor y usa la rueda o pellizca para acercarte. Pulsa cualquier estrella, planeta o galaxia para saber qué es. Pruébalo ahora.',
    "Arrossega el cel per mirar al voltant i fes servir la roda o pessiga per apropar-t'hi. Prem qualsevol estrella, planeta o galàxia per saber què és. Prova-ho ara.",
  ],
  'guide.niceDrag': ['That’s it!', '¡Eso es!', 'Així mateix!'],
  'guide.searchTitle': ['Find anything', 'Encuentra lo que quieras', 'Troba el que vulguis'],
  'guide.search': [
    'Search for a planet, star or galaxy by name or number: Jupiter, Vega, M31…',
    'Busca un planeta, una estrella o una galaxia por su nombre o número: Júpiter, Vega, M31…',
    'Cerca un planeta, una estrella o una galàxia pel nom o el número: Júpiter, Vega, M31…',
  ],
  'guide.timeTitle': ['Travel in time', 'Viaja en el tiempo', 'Viatja en el temps'],
  'guide.time': [
    'Pause, speed up or run time backwards to watch the sky turn. “Now” brings you back to the present.',
    'Pausa, acelera o haz correr el tiempo hacia atrás para ver girar el cielo. «Ahora» te devuelve al presente.',
    'Atura, accelera o fes córrer el temps enrere per veure girar el cel. «Ara» et torna al present.',
  ],
  'guide.settingsTitle': ['Your sky', 'Tu cielo', 'El teu cel'],
  'guide.settings': [
    'Set your place, the date, how dark your sky is and what to show: Milky Way, constellations, galaxies… The language is here too.',
    'Elige tu sitio, la fecha, lo oscuro que es tu cielo y qué mostrar: Vía Láctea, constelaciones, galaxias… El idioma también está aquí.',
    'Tria el teu lloc, la data, com de fosc és el teu cel i què mostrar: Via Làctia, constel·lacions, galàxies… El idioma també és aquí.',
  ],
  'guide.scopeTitle': ['Look through a telescope', 'Mira por un telescopio', 'Mira per un telescopi'],
  'guide.scope': [
    'This shows the sky as it looks through an eyepiece. Press it to try it.',
    'Esto muestra el cielo tal como se ve por un ocular. Púlsalo para probarlo.',
    "Això mostra el cel tal com es veu per un ocular. Prem-lo per provar-ho.",
  ],
  'guide.gearTitle': ['Choose your equipment', 'Elige tu equipo', 'Tria el teu equip'],
  'guide.gear': [
    'Pick a real telescope, an eyepiece and a Barlow. Every change shows up in the eyepiece at once, and the gauges explain what you gain.',
    'Elige un telescopio real, un ocular y una Barlow. Cada cambio se ve al momento en el ocular y los medidores explican qué ganas.',
    "Tria un telescopi real, un ocular i una Barlow. Cada canvi es veu a l'instant a l'ocular i els indicadors expliquen què hi guanyes.",
  ],
  'guide.targetsTitle': ['What to look at', 'Qué mirar', 'Què mirar'],
  'guide.targets': [
    'Step through what is visible right now: the Moon, the planets, clusters, nebulae and galaxies. Clear skies!',
    'Recorre lo que está visible ahora mismo: la Luna, los planetas, cúmulos, nebulosas y galaxias. ¡Cielos despejados!',
    'Recorre el que és visible ara mateix: la Lluna, els planetes, cúmuls, nebuloses i galàxies. Cels serens!',
  ],
} as const satisfies Record<string, Msg>;

export type MsgKey = keyof typeof M;

/** Common names of deep-sky objects in Spanish and Catalan (English comes from the catalogue). */
const DSO_NAMES: Record<string, [string, string]> = {
  LMC: ['Gran Nube de Magallanes', 'Gran Núvol de Magalhães'],
  SMC: ['Pequeña Nube de Magallanes', 'Petit Núvol de Magalhães'],
  M45: ['Pléyades', 'Plèiades'],
  'NGC 6231': ['Joyero del Norte', 'Joier del Nord'],
  'NGC 3372': ['Nebulosa de la Quilla', 'Nebulosa de la Quilla'],
  M44: ['Cúmulo del Pesebre', 'Cúmul del Pessebre'],
  M7: ['Cúmulo de Ptolomeo', 'Cúmul de Ptolemeu'],
  M31: ['Galaxia de Andrómeda', "Galàxia d'Andròmeda"],
  'NGC 869': ['Doble Cúmulo (h Persei)', 'Doble Cúmul (h Persei)'],
  'NGC 884': ['Doble Cúmulo (χ Persei)', 'Doble Cúmul (χ Persei)'],
  M42: ['Nebulosa de Orión', "Nebulosa d'Orió"],
  'NGC 7000': ['Nebulosa Norteamérica', 'Nebulosa Nord-amèrica'],
  'NGC 104': ['47 Tucanae', '47 Tucanae'],
  M6: ['Cúmulo de la Mariposa', 'Cúmul de la Papallona'],
  M24: ['Nube estelar de Sagitario', 'Núvol estel·lar de Sagitari'],
  'NGC 5139': ['Omega Centauri', 'Omega Centauri'],
  M33: ['Galaxia del Triángulo', 'Galàxia del Triangle'],
  M13: ['Gran Cúmulo de Hércules', "Gran Cúmul d'Hèrcules"],
  M8: ['Nebulosa de la Laguna', 'Nebulosa de la Llacuna'],
  M11: ['Cúmulo del Pato Salvaje', "Cúmul de l'Ànec Salvatge"],
  M16: ['Nebulosa del Águila', "Nebulosa de l'Àguila"],
  'NGC 457': ['Cúmulo del Búho', 'Cúmul del Mussol'],
  M81: ['Galaxia de Bode', 'Galàxia de Bode'],
  M17: ['Nebulosa Omega', 'Nebulosa Omega'],
  'NGC 6960': ['Nebulosa del Velo Occidental', 'Nebulosa del Vel Occidental'],
  'NGC 6992': ['Nebulosa del Velo Oriental', 'Nebulosa del Vel Oriental'],
  'NGC 5128': ['Centaurus A', 'Centaurus A'],
  M83: ['Galaxia del Molinillo Austral', 'Galàxia del Molinet Austral'],
  'NGC 2070': ['Nebulosa de la Tarántula', 'Nebulosa de la Taràntula'],
  'NGC 7293': ['Nebulosa de la Hélice', "Nebulosa de l'Hèlix"],
  M27: ['Nebulosa Dumbbell', 'Nebulosa Dumbbell'],
  'NGC 3242': ['Fantasma de Júpiter', 'Fantasma de Júpiter'],
  M101: ['Galaxia del Molinete', 'Galàxia del Molinet'],
  M82: ['Galaxia del Cigarro', 'Galàxia del Cigar'],
  M1: ['Nebulosa del Cangrejo', 'Nebulosa del Cranc'],
  M51: ['Galaxia del Remolino', 'Galàxia del Remolí'],
  M40: ['Winnecke 4', 'Winnecke 4'],
  M64: ['Galaxia del Ojo Negro', "Galàxia de l'Ull Negre"],
  M20: ['Nebulosa Trífida', 'Nebulosa Trífida'],
  M104: ['Galaxia del Sombrero', 'Galàxia del Sombrero'],
  M63: ['Galaxia del Girasol', 'Galàxia del Gira-sol'],
  M57: ['Nebulosa del Anillo', "Nebulosa de l'Anell"],
  'IC 2602': ['Pléyades del Sur', 'Plèiades del Sud'],
  M43: ['Nebulosa de De Mairan', 'Nebulosa de De Mairan'],
  'NGC 2237': ['Nebulosa Roseta', 'Nebulosa de la Roseta'],
  M87: ['Virgo A', 'Virgo A'],
  'NGC 4755': ['Joyero', 'Joier'],
  'NGC 6543': ['Nebulosa Ojo de Gato', "Nebulosa Ull de Gat"],
  'NGC 2392': ['Nebulosa del Esquimal', "Nebulosa de l'Esquimal"],
  M99: ['Molinete de Coma', 'Molinet de Coma'],
  M97: ['Nebulosa del Búho', 'Nebulosa del Mussol'],
  M76: ['Pequeña Dumbbell', 'Petita Dumbbell'],
  'NGC 4565': ['Galaxia de la Aguja', "Galàxia de l'Agulla"],
  'NGC 253': ['Galaxia del Escultor', "Galàxia de l'Escultor"],
};

/** Model names that are descriptions rather than brands. */
const MODEL_NAMES: Record<string, [string, string]> = {
  'binoculars-10x50': ['Prismáticos 10×50', 'Prismàtics 10×50'],
  'binoculars-15x70': ['Prismáticos astronómicos 15×70', 'Prismàtics astronòmics 15×70'],
  'printed-70-400': ['Refractor impreso en 3D 70/400', 'Refractor imprès en 3D 70/400'],
};

export function modelName(id: string, english: string): string {
  if (current === 'en' || !MODEL_NAMES[id]) return english;
  return MODEL_NAMES[id][current === 'es' ? 0 : 1];
}

/** Telescope notes in Spanish and Catalan (English is in equipment.ts). */
const NOTES: Record<string, [string, string]> = {
  'binoculars-10x50': ['El primer instrumento clásico: vistas amplias y luminosas de la Vía Láctea.', 'El primer instrument clàssic: vistes àmplies i lluminoses de la Via Làctia.'],
  'binoculars-15x70': ['Prismáticos grandes para cúmulos y cometas; mejor en trípode.', 'Prismàtics grans per a cúmuls i cometes; millor en trípode.'],
  'printed-70-400': ['El refractor de github.com/PSCactux/telescope-generator.', 'El refractor de github.com/PSCactux/telescope-generator.'],
  'astromaster-70az': ['Acromático largo y lento: poco color falso, bueno para la Luna y los planetas.', 'Acromàtic llarg i lent: poc color fals, bo per a la Lluna i els planetes.'],
  'startravel-102': ['Refractor corto de gran campo: vistas amplias, halo violeta en objetos brillantes.', 'Refractor curt de gran camp: vistes àmplies, halo violeta en objectes brillants.'],
  'redcat-51': ['Apocromático diminuto pensado para astrofotografía de gran campo.', 'Apocromàtic diminut pensat per a astrofotografia de gran camp.'],
  'evostar-80ed': ['Doblete ED: imágenes nítidas y sin color en un tubo pequeño.', 'Doblet ED: imatges nítides i sense color en un tub petit.'],
  'fsq-106': ['Apocromático de cuatro lentes de gama alta.', "Apocromàtic de quatre lents d'alta gamma."],
  'heritage-130p': ['Dobson de sobremesa plegable: mucha apertura para su tamaño.', 'Dobson de sobretaula plegable: molta obertura per la seva mida.'],
  'skyliner-200p': ['El popular Dobson de 8 pulgadas: galaxias, nebulosas y planetas nítidos.', 'El popular Dobson de 8 polzades: galàxies, nebuloses i planetes nítids.'],
  'skyliner-300p': ['Un Dobson de 12 pulgadas: los cúmulos globulares se resuelven en estrellas.', 'Un Dobson de 12 polzades: els cúmuls globulars es resolen en estrelles.'],
  'skymax-102': ['Maksutov compacto: muchos aumentos para la Luna y los planetas.', 'Maksutov compacte: molts augments per a la Lluna i els planetes.'],
  'nexstar-127slt': ['Maksutov con GoTo, uno de los favoritos para planetas.', 'Maksutov amb GoTo, un dels preferits per a planetes.'],
  'nexstar-8se': ['El clásico Schmidt-Cassegrain de 8 pulgadas.', 'El clàssic Schmidt-Cassegrain de 8 polzades.'],
  c11: ['Un Schmidt-Cassegrain de 11 pulgadas para observar en serio.', 'Un Schmidt-Cassegrain de 11 polzades per observar seriosament.'],
};

const STORAGE_KEY = 'lang'; // shared with the home page of the site
let current: Lang = detect();
const listeners: (() => void)[] = [];

function detect(): Lang {
  const isLang = (x: string | null | undefined): x is Lang => !!x && (LANGS as readonly string[]).includes(x);
  if (typeof window === 'undefined') return 'en'; // tests and other non-browser use
  const param = new URLSearchParams(location.search).get('lang');
  if (isLang(param)) return param;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // No storage: fall through to the browser languages.
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return 'en';
}

const index = (l: Lang) => LANGS.indexOf(l);

export function lang(): Lang {
  return current;
}

export function locale(): string {
  return LOCALES[current];
}

export function langName(l: Lang): string {
  return LANG_NAMES[l];
}

export function t(key: MsgKey, vars: Record<string, string | number> = {}): string {
  const text: string = M[key][index(current)];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Like t() but for keys built at run time; returns `fallback` when there is no such message. */
export function tx(key: string, fallback: string, vars: Record<string, string | number> = {}): string {
  return key in M ? t(key as MsgKey, vars) : fallback;
}

export function dsoName(id: string, english: string): string {
  if (current === 'en' || !DSO_NAMES[id]) return english;
  return DSO_NAMES[id][current === 'es' ? 0 : 1];
}

export function telescopeNote(id: string, english: string): string {
  if (current === 'en' || !NOTES[id]) return english;
  return NOTES[id][current === 'es' ? 0 : 1];
}

/** Every translated name of a deep-sky object, for the search index. */
export function dsoNamesAll(id: string): string[] {
  return DSO_NAMES[id] ? [...DSO_NAMES[id]] : [];
}

/** Every translation of a message, for the search index. */
export function allTranslations(key: MsgKey): string[] {
  return [...M[key]];
}

/** Number with the decimal separator of the current language. */
export function num(x: number, digits = 0): string {
  return x.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Compass point (N, NNE…) in the current language: Spanish and Catalan write O for west. */
export function localCompass(point: string): string {
  return current === 'en' ? point : point.replace(/W/g, 'O');
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // Not saved: it still applies to this visit.
  }
  applyStatic();
  for (const f of listeners) f();
}

export function onLangChange(f: () => void): void {
  listeners.push(f);
}

/** Fills elements marked with data-i18n (text), data-i18n-title, data-i18n-aria and data-i18n-placeholder. */
export function applyStatic(root: ParentNode = document): void {
  document.documentElement.lang = current;
  document.title = t('app.title');
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as MsgKey); });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle as MsgKey); });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria as MsgKey)));
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder as MsgKey); });
}

/** For the tests: every message with its three translations. */
export const MESSAGES: Record<string, Msg> = M;
