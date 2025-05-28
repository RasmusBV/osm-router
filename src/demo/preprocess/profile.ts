
// Inspired by the car profile from project OSRM
// https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/car.lua

export const profile = {
    u_turn_penalty: 20,
    traffic_signal_penalty: 2,
    default_speed: 10,
    side_road_multiplier: 0.8,
    speed_reduction: 0.8,
    speed_penalty_min: 0.5,
  
    barrier_whitelist: new Set<string | undefined>([
        'cattle_grid', 'border_control', 'toll_booth', 'sally_port',
        'gate', 'lift_gate', 'no', 'entrance',
        'height_restrictor', 'arch'
    ]),
  
    access_tag_whitelist: new Set<string | undefined>([
        'yes', 'motorcar', 'motor_vehicle', 'vehicle',
        'permissive', 'designated', 'hov'
    ]),
  
    access_tag_blacklist: new Set<string | undefined>([
        'no', 'agricultural', 'forestry', 'emergency',
        'psv', 'customers', 'private', 'delivery', 'destination'
    ]),
    
    restricted_access_tag_list: new Set<string | undefined>([
        'private', 'delivery', 'destination', 'customers'
    ]),
  
    access_tags_hierarchy: ['motorcar', 'motor_vehicle', 'vehicle', 'access'],
  
    service_tag_forbidden: new Set<string | undefined>(['emergency_access', 'parking_aisle']),
  
    restrictions: ['motorcar', 'motor_vehicle', 'vehicle'],
  
    avoid: new Set<string | undefined>([
        'area', 'reversible', 'impassable', 'hov_lanes',
        'steps', 'construction', 'proposed', 'pedestrian',
        'busway', 'footway'
    ]),
  
    speeds: {
        highway: {
            motorway: 90,
            motorway_link: 45,
            trunk: 85,
            trunk_link: 40,
            primary: 65,
            primary_link: 30,
            secondary: 55,
            secondary_link: 25,
            tertiary: 40,
            tertiary_link: 20,
            unclassified: 25,
            residential: 25,
            living_street: 10,
            service: 15
        } as Record<string, number>
    },
  
    service_penalties: {
        alley: 0.5,
        parking: 0.5,
        parking_aisle: 0.5,
        driveway: 0.5,
        "drive-through": 0.5,
        "drive-thru": 0.5
    } as Record<string, number>,
  
    restricted_highway_whitelist: new Set<string | undefined>([
        'motorway', 'motorway_link', 'trunk', 'trunk_link',
        'primary', 'primary_link', 'secondary', 'secondary_link',
        'tertiary', 'tertiary_link', 'residential',
        'living_street', 'unclassified', 'service'
    ]),
  
    construction_whitelist: new Set<string | undefined>(['no', 'widening', 'minor']),
  
    route_speeds: {
        ferry: 5,
        shuttle_train: 10
    } as Record<string, number>,
  
    surface_speeds: {
        asphalt: null,
        concrete: null,
        "concrete:plates": null,
        "concrete:lanes": null,
        paved: null,
        
        cement: 80,
        compacted: 80,
        fine_gravel: 80,
        
        paving_stones: 60,
        metal: 60,
        bricks: 60,
        
        grass: 40,
        wood: 40,
        sett: 40,
        grass_paver: 40,
        gravel: 40,
        unpaved: 40,
        ground: 40,
        dirt: 40,
        pebblestone: 40,
        tartan: 40,
        
        cobblestone: 30,
        clay: 30,
        
        earth: 20,
        stone: 20,
        rocky: 20,
        sand: 20,
        
        mud: 10
    } as Record<string, number | null>,
  
    tracktype_speeds: {
        grade1: 60,
        grade2: 40,
        grade3: 30,
        grade4: 25,
        grade5: 20
    } as Record<string, number>,
  
    smoothness_speeds: {
        intermediate: 80,
        bad: 40,
        very_bad: 20,
        horrible: 10,
        very_horrible: 5,
        impassable: 0
    } as Record<string, number>,
  
    maxspeed_table_default: {
        urban: 50,
        rural: 90,
        trunk: 110,
        motorway: 130
    } as Record<string, number>,
  
    maxspeed_table: {
        "at:rural": 100,
        "at:trunk": 100,
        "be:motorway": 120,
        "be-bru:rural": 70,
        "be-bru:urban": 30,
        "be-vlg:rural": 70,
        "bg:motorway": 140,
        "by:urban": 60,
        "by:motorway": 110,
        "ca-on:rural": 80,
        "ch:rural": 80,
        "ch:trunk": 100,
        "ch:motorway": 120,
        "cz:trunk": 0,
        "cz:motorway": 0,
        "de:living_street": 7,
        "de:rural": 100,
        "de:motorway": 0,
        "dk:rural": 80,
        "es:trunk": 90,
        "fr:rural": 80,
        "gb:nsl_single": (60 * 1609) / 1000,
        "gb:nsl_dual": (70 * 1609) / 1000,
        "gb:motorway": (70 * 1609) / 1000,
        "nl:rural": 80,
        "nl:trunk": 100,
        "no:rural": 80,
        "no:motorway": 110,
        "ph:urban": 40,
        "ph:rural": 80,
        "ph:motorway": 100,
        "pl:rural": 100,
        "pl:expressway": 120,
        "pl:motorway": 140,
        "ro:trunk": 100,
        "ru:living_street": 20,
        "ru:urban": 60,
        "ru:motorway": 110,
        "uk:nsl_single": (60 * 1609) / 1000,
        "uk:nsl_dual": (70 * 1609) / 1000,
        "uk:motorway": (70 * 1609) / 1000,
        "za:urban": 60,
        "za:rural": 100,
        "none": 140
    } as Record<string, number>,
} as const
  