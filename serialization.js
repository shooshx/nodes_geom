"use strict"

function save_program() {
    let sprog = { nodes: {}, lines:[], 
        next_node_id: program.next_obj_id, 
        names_idx_s: program.names_indices,
        display_node_id: (program.display_node == null) ? null : program.display_node.id,
        tdisp_node_ids: [], 
        input_node_ids: [],
        nodes_view: nodes_view.save(),  // part of the program so the user won't need to start looking for the nodes
    }
    for(let n of program.nodes) {
        let sn = { params: {}, name:n.name, cls_name: n.cls.constructor.name(), x:n.x, y:n.y, disp_param:n.display_values }
        for(let p of n.parameters) {
            const ov = p.save()
            if (ov !== null)
                sn.params[p.label] = ov
        }        
        sprog.nodes[n.id] = sn
    }
    for(let line of program.lines) {
        let from_term = line.from_term.get_attachee()
        let to_term = line.to_term.get_attachee()
        sprog.lines.push({ from_name: from_term.name, from_id: from_term.owner.id,
                           to_name:   to_term.name,   to_id: to_term.owner.id,
                           uid: line.uid })
    }
    for(let tn of program.tdisp_nodes) {
        sprog.tdisp_node_ids.push(tn.id)
    }
    for(let inn of program.input_nodes) {
        sprog.input_node_ids.push(inn.id)
    }
    return sprog
}

function json_stringify(obj) {
    let json = JSON.stringify(obj, function(k, v) {
        if (ArrayBuffer.isView(v)) 
            return Array.from(v);        
        return v;
    })
    return json
}

function save_program_json() {
    let sprog = save_program()
    return json_stringify(sprog)
}

function load_prog_obj(prog) {
    load_program(prog)
    draw_nodes()
    trigger_frame_draw(true)
}

function load_prog_json(prog_s) {
    let prog = JSON.parse(prog_s)
    load_prog_obj(prog)
}

var user_saved_programs = {}

function make_state(with_saves) {
    let state = { program: save_program(),                  
                  main_view_s: main_view_state.save(),                  
                }
    let color_pre = ColorPicker.get_presets()
    if (Object.keys(color_pre).length > 0)
        state.color_presets = color_pre
    if (with_saves)
        state.user_saved_progs = user_saved_programs

    const  json = json_stringify(state)
    return json
}

function save_state() {
    if (g_loading_page || g_loading_prog)
        return
    const json = make_state(false)
    localStorage.setItem("state", json)
}

function save_saved_progs() {
    const j_saved = json_stringify(user_saved_programs)
    localStorage.setItem("user_saved_progs", j_saved)
}

// -----------
function find_param_by_name(name, parameters) {
    for(let p of parameters)
        if (p.label === name)
            return p
    return null
}

function load_program(sprog) {
    try {
        g_loading_prog = true
        _load_program(sprog)
    }
    finally {
        g_loading_prog = false
    }
}

function _load_program(sprog) 
{
    nodes_unselect_all(false)
    clear_program()
    
    const newprog = new Program()

    // creating nodes below doesn't add to this, adds only ephmeral ids
    newprog.next_obj_id = parseInt(sprog.next_node_id) 
    for(let n in sprog.names_idx_s)
        newprog.names_indices[n] = parseInt(sprog.names_idx_s[n])

    for(let nid_s in sprog.nodes) {
        let nid = parseInt(nid_s)
        let sn = sprog.nodes[nid]
        let cls = nodes_classes_by_name[sn.cls_name]
        console.assert(cls !== undefined && cls !== null, "Unknown node class " + sn.cls_name)
        let n = newprog.add_node(sn.x, sn.y, sn.name, cls, nid)
        for(let spname in sn.params) {
            let sp = sn.params[spname]            
            let p = find_param_by_name(spname, n.parameters)
            if (p === null)
                p = n.param_aliases[spname]
            if (p === undefined) {
                console.error("Missing parameter " + spname + " of node " + sn.name)
                continue
            }
            try {
                p.load(sp)
                p.call_change()
                p.pset_dirty()
            }
            catch (e) {
                console.warn("Failed load of parameter", p.label, "in node", sn.name)
            }
        }
        //if (n.cls.post_load_hook)  moved below
        //    n.cls.post_load_hook()
        if (sn.disp_param)
            n.display_values = sn.disp_param
    }
    let find_by_name = function (cont, name) {
        for(let o of cont)
            if (o.name == name)
                return o
        return null
    }
    for(let sl of sprog.lines) {
        let from_node = newprog.obj_map[sl.from_id]
        console.assert(from_node.constructor === Node)
        let from_term = find_by_name(from_node.terminals, sl.from_name)
        let to_node = newprog.obj_map[sl.to_id]
        console.assert(to_node.constructor === Node)
        let to_term = find_by_name(to_node.terminals, sl.to_name)
        if (to_term === null)
            to_term = to_node.terminal_aliases[sl.to_name]
        if (to_term === undefined) {
            console.log("Can't find terminal ", sl.to_name, " for node ", to_node.name)
            continue // happens when terminal names change
        }
        if (from_term === null || to_term === null) { // term changed name?
            console.warn("did not find terminal of node ", from_node.name)
            continue
        }
        newprog.add_line(new Line(from_term.get_attachment(), to_term.get_attachment()), sl.uid)
    }

    for(let n of newprog.nodes) {
        if (n.cls.post_load_hook)
            n.cls.post_load_hook()
        for(let p of n.parameters)
            if (p.post_load_hook)
                p.post_load_hook()
    }

    if (sprog.display_node_id == null || newprog.obj_map[sprog.display_node_id] === undefined)
        newprog.set_display_node(null)
    else
        newprog.set_display_node(newprog.obj_map[sprog.display_node_id])

    newprog.tdisp_nodes = []
    if (sprog.tdisp_node_ids !== undefined) {
        for(let tnid of sprog.tdisp_node_ids) {
            let tn = newprog.obj_map[tnid]
            if (tn === undefined)
                continue
            //console.assert(tn !== undefined, "template node not found")
            newprog.set_template_node(tn, false)
        }
    }
    if (sprog.input_node_ids !== undefined) {
        for(let inid of sprog.input_node_ids) {
            const inn = newprog.obj_map[inid]
            console.assert(inn !== undefined, "input node not found")
            newprog.set_input_node(inn, false)
        }
    }

    if (sprog.nodes_view !== undefined) // old progs don't have it
        nodes_view.load(sprog.nodes_view)

    console.assert(newprog.next_obj_id === parseInt(sprog.next_node_id), "Unexpected ids created")

    program = newprog // commit to it
}

var g_loading_prog = false
var g_loading_page = false // used for avoiding spurious saves during load
function set_loading(v) {
    g_loading_page = v
}

function load_state() {
    let state_s = localStorage.getItem("state")
    if (state_s === null)
        return
    //console.log("LOADING: " + state)
    let state = JSON.parse(state_s)
    main_view_state.load(state.main_view_s)
    if (state.color_presets)
        ColorPicker.set_presets(state.color_presets)

    let saved_s = localStorage.getItem('user_saved_progs')
    if (saved_s !== null)
        user_saved_programs = JSON.parse(saved_s)
    else if (state.user_saved_progs)
        user_saved_programs = state.user_saved_progs

    try {
        load_program(state.program) 
    }
    catch(e) {
        console.error("Failed loading current program" + e)
    }
}
