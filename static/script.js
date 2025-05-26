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

let lastFrom = markerToUrlParam(from)
let lastTo = markerToUrlParam(to)
let currentPath = undefined
let fetching = false
let fetchAgain = false

async function getPath(direction) {
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
                from: direction ? markerToUrlParam(from) : lastFrom,
                to: direction ? lastTo : markerToUrlParam(to),
                via: markerToUrlParam(via),
                strength: getStrength(),
                avoid: avoid.checked
            }),
            method: "POST"
        }).then((res) => res.json())
        if(direction) {
            lastFrom = markerToUrlParam(from)
        } else {
            lastTo = markerToUrlParam(to)
        }
        if(currentPath) {
            currentPath.remove()
        }
        currentPath = L.geoJSON(path).addTo(map)
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

from.on("move", () => getPath(true))
to.on("move", () => getPath(false))
via.on("move", () => {
    circle.setLatLng(via.getLatLng())
    getPath(true)
})

getPath(true)