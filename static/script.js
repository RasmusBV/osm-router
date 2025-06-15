"strict"
const map = L.map('map').setView([48.85, 2.34], 12);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const from = L.marker([48.8512, 2.3329], {
    draggable: true
}).addTo(map)

const to = L.marker([48.8553, 2.3595], {
    draggable: true
}).addTo(map)

const via = L.marker([48.8513, 2.3561], {
    draggable: true
}).addTo(map)

const MIN = 0
const MAX = 2000

const circle = L.circle([48.8513, 2.3561], {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.2,
    radius: 0
}).addTo(map);

const strengtSlider = document.getElementById("bubble-size")
const avoid = document.getElementById("avoid")
const loading = document.getElementById("loading")
const iterationsEl = document.getElementById("iterations")
const totalTimeEl = document.getElementById("totalTime")
const totalLengthEl = document.getElementById("totalLength")
const throughputEl = document.getElementById("throughput")

function getStrength() {
    return parseInt(strengtSlider.value)/10
}

function setBubbleSize() {
    const value = MIN + getStrength() * (MAX-MIN)
    circle.setRadius(value)
}

strengtSlider.addEventListener("input", () => {
    setBubbleSize()
    getPath()
})

avoid.addEventListener("change", () => {
    getPath()
})

setBubbleSize()

let currentPath = undefined
let fetching = false
let fetchAgain = false

async function getPath() {
    if(fetching) {
        fetchAgain = true
        return
    }
    loading.removeAttribute("hidden")
    fetching = true
    try {
        const path = await fetch("/path", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                from: markerToUrlParam(from),
                to: markerToUrlParam(to),
                via: markerToUrlParam(via),
                strength: getStrength(),
                avoid: avoid.checked
            }),
            method: "POST"
        }).then((res) => res.json())
        iterationsEl.innerText = path.iterations.toFixed(2) ?? "N/A"
        totalTimeEl.innerText = path.totalTime.toFixed(2) ?? "N/A"
        totalLengthEl.innerText = path.length.toFixed(2) ?? "N/A"
        const throughput = path.iterations / path.totalTime
        throughputEl.innerText = throughput.toFixed(2) ?? "N/A"
        currentPath?.remove()
        currentPath = L.geoJSON(path.geometry).addTo(map)
    } catch(e) {
        console.warn(e)
    }
    fetching = false
    if(fetchAgain) {
        fetchAgain = false
        getPath()
    } else {
        loading.setAttribute("hidden", "")
    }
}

function markerToUrlParam(marker) {
    const latLng = marker.getLatLng()
    return [latLng.lng, latLng.lat]
}

from.on("move", () => getPath())
to.on("move", () => getPath())
via.on("move", () => {
    circle.setLatLng(via.getLatLng())
    getPath()
})

getPath()