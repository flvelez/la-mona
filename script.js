const ICONOS = { "Corazones": "♥", "Diamantes": "♦", "Tréboles": "♣", "Espadas": "♠", "Especial": "🤡" };
let mazo = [], mesa = [], manos = [[], []], ganadas = [[], []];
let turnoActual = 0, cartaArrastrada = null, origenCarta = null, seleccionadosMesa = [], objetivoMenu = null;

function iniciarMazo() {
    mazo = []; mesa = []; ganadas = [[], []]; turnoActual = 0; seleccionadosMesa = [];
    const palos = ["Corazones", "Diamantes", "Tréboles", "Espadas"];
    palos.forEach(p => {
        for(let v=1; v<=13; v++) {
            let n = v===1?"A":v===11?"J":v===12?"Q":v===13?"K":v.toString();
            mazo.push({ n, p, v, id: Math.random() });
        }
    });
    mazo.push({ n: "Mona", p: "Especial", v: 15, mona: true, id: "m53" });
    mazo.sort(() => Math.random() - 0.5);
    mesa.push({ componentes: [mazo.pop()], valorTotal: 0 }); 
    mesa[0].valorTotal = mesa[0].componentes[0].v;
    repartirRonda();
}

function repartirRonda() {
    manos[0] = mazo.splice(0, 6); manos[1] = mazo.splice(0, 6);
    actualizarInterfaz();
}

function actualizarInterfaz() {
    document.getElementById('cartas-mesa').innerHTML = '';
    document.getElementById('tu-mano').innerHTML = '';
    document.getElementById('mano-j2').innerHTML = '';
    mesa.forEach(obj => document.getElementById('cartas-mesa').appendChild(crearFormacionHTML(obj)));
    manos[0].forEach(c => document.getElementById('tu-mano').appendChild(crearCartaHTML(c, 0)));
    manos[1].forEach(c => document.getElementById('mano-j2').appendChild(crearCartaHTML(c, 1)));
    document.getElementById('turno-indicador').innerText = `TURNO: J${turnoActual + 1}`;
    document.getElementById('count-A').innerText = ganadas[0].length;
    document.getElementById('count-B').innerText = ganadas[1].length;
}

function crearCartaHTML(c, owner) {
    const div = document.createElement('div');
    div.className = `carta ${(c.p==='Corazones'||c.p==='Diamantes')?'roja':''} ${c.mona?'mona':''}`;
    div.draggable = (owner === turnoActual);
    div.innerHTML = `<div class="v-sup">${c.n}</div><div class="suit-cen">${ICONOS[c.p]}</div>`;
    div.ondragstart = () => { cartaArrastrada = c; origenCarta = owner; };
    return div;
}

function crearFormacionHTML(objMesa) {
    const container = document.createElement('div');
    container.className = "formacion-container " + (seleccionadosMesa.includes(objMesa) ? "seleccionada" : "");
    objMesa.componentes.forEach((c, idx) => {
        const d = document.createElement('div');
        d.className = `carta ${(c.p==='Corazones'||c.p==='Diamantes')?'roja':''} ${c.mona?'mona':''}`;
        d.style.left = `${idx * 12}px`; d.style.top = `${idx * 6}px`; d.style.zIndex = idx;
        d.innerHTML = `<div class="v-sup">${c.n}</div><div class="suit-cen">${ICONOS[c.p]}</div>`;
        container.appendChild(d);
    });
    container.onclick = (e) => {
        e.stopPropagation();
        if (seleccionadosMesa.includes(objMesa)) seleccionadosMesa = seleccionadosMesa.filter(m => m !== objMesa);
        else seleccionadosMesa.push(objMesa);
        actualizarInterfaz();
    };
    container.ondragover = e => e.preventDefault();
    container.ondrop = e => { e.stopPropagation(); abrirMenuAcciones(objMesa); };
    return container;
}

function abrirMenuAcciones(objMesa) {
    if (origenCarta !== turnoActual || !cartaArrastrada) return;
    objetivoMenu = objMesa;

    // Lógica Multi-Selección (Sumar varias de la mesa con una de mi mano)
    if (seleccionadosMesa.length > 0) {
        if (!seleccionadosMesa.includes(objMesa)) seleccionadosMesa.push(objMesa);
        let sumaTotalMesa = seleccionadosMesa.reduce((a, b) => a + b.valorTotal, 0);
        let vMano = (cartaArrastrada.n === "A" && sumaTotalMesa === 14) ? 14 : cartaArrastrada.v;

        if (vMano === sumaTotalMesa) {
            ejecutarAccion('llevar_multiple');
            return;
        }
    }

    // Lógica Individual / Acumulación
    const vMano = (cartaArrastrada.n === "A" && objMesa.valorTotal === 14) ? 14 : cartaArrastrada.v;
    const vMesa = objMesa.valorTotal;
    const sumaResultante = vMano + vMesa;

    // ¿Existe ya en la mesa otra formación con el mismo valor que la suma que voy a hacer?
    // Ejemplo: Tengo 10, hay un 2 (Suma 12). Si ya hay otro 12 en mesa, se permite "FILA".
    let existeMismoValorEnMesa = mesa.some(m => m !== objMesa && m.valorTotal === sumaResultante);

    let puedeLlevar = (vMano === vMesa || cartaArrastrada.n === objMesa.componentes[0].n);
    let puedeFila = (vMano === vMesa || existeMismoValorEnMesa);
    let puedeSumar = (sumaResultante <= 15);

    document.getElementById('menu-acciones').classList.remove('hidden');
    document.getElementById('btn-llevar').style.display = puedeLlevar ? "block" : "none";
    document.getElementById('btn-fila').style.display = puedeFila ? "block" : "none";
    document.getElementById('btn-sumar').style.display = puedeSumar ? "block" : "none";

    document.getElementById('btn-llevar').onclick = () => ejecutarAccion('llevar');
    document.getElementById('btn-fila').onclick = () => {
        if (existeMismoValorEnMesa) {
            ejecutarAccion('acumular_fila', sumaResultante);
        } else {
            ejecutarAccion('fila');
        }
    };
    document.getElementById('btn-sumar').onclick = () => ejecutarAccion('sumar', sumaResultante);
}

function ejecutarAccion(tipo, valSuma) {
    let eq = ganadas[turnoActual];
    if (tipo === 'llevar_multiple') {
        eq.push(cartaArrastrada);
        seleccionadosMesa.forEach(f => { eq.push(...f.componentes); mesa = mesa.filter(m => m !== f); });
    } else if (tipo === 'llevar') {
        eq.push(cartaArrastrada, ...objetivoMenu.componentes);
        mesa = mesa.filter(m => m !== objetivoMenu);
    } else if (tipo === 'fila') {
        objetivoMenu.componentes.push(cartaArrastrada);
    } else if (tipo === 'sumar') {
        objetivoMenu.componentes.push(cartaArrastrada);
        objetivoMenu.valorTotal = valSuma;
    } else if (tipo === 'acumular_fila') {
        // Buscamos la otra formación que tiene el mismo valor
        let otra = mesa.find(m => m !== objetivoMenu && m.valorTotal === valSuma);
        otra.componentes.push(cartaArrastrada, ...objetivoMenu.componentes);
        mesa = mesa.filter(m => m !== objetivoMenu);
    }
    removerDeMano(turnoActual, cartaArrastrada);
    cerrarMenu(); cambiarTurno();
}

function dropOnMesa(e) {
    e.preventDefault();
    if (origenCarta !== turnoActual || !cartaArrastrada) return;
    mesa.push({ componentes: [cartaArrastrada], valorTotal: cartaArrastrada.v });
    removerDeMano(turnoActual, cartaArrastrada);
    cambiarTurno();
}

function removerDeMano(p, c) { manos[p] = manos[p].filter(x => x.id !== c.id); }
function cambiarTurno() {
    cartaArrastrada = null; seleccionadosMesa = [];
    turnoActual = (turnoActual === 0) ? 1 : 0;
    if (manos[0].length === 0 && manos[1].length === 0 && mazo.length > 0) repartirRonda();
    actualizarInterfaz();
}
function cerrarMenu() { document.getElementById('menu-acciones').classList.add('hidden'); }
function allowDrop(e) { e.preventDefault(); }
iniciarMazo();