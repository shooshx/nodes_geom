"use strict"

function save_program() {
    let sprog = { nodes: {}, lines:[], 
        next_node_id: program.next_node_id, 
        names_idx_s: program.names_indices,
        display_node_id: (program.display_node == null) ? null : program.display_node.id
    }
    for(let n of program.nodes) {
        let sn = { params: {}, name:n.name, cls_name: n.cls.constructor.name(), x:n.x, y:n.y }
        for(let p of n.parameters) {
            sn.params[p.label] = p.save()
        }        
        sprog.nodes[n.id] = sn
    }
    for(let line of program.lines) {
        let from_term = line.from_term.get_attachee()
        let to_term = line.to_term.get_attachee()
        sprog.lines.push({ from_name: from_term.name, from_id: from_term.owner.id,
                           to_name:   to_term.name,   to_id: to_term.owner.id })
    }
    return sprog
}

function save_state() {
    let state = { program: save_program(),
                  nodes_view: nodes_view.save(), 
                  main_view_s: main_view_state.save() }

    //console.log("SAVING: + ", JSON.stringify(state))
    let json = JSON.stringify(state, function(k, v) {
        if (ArrayBuffer.isView(v)) 
            return Array.from(v);        
        return v;
    })
    localStorage.setItem("state", json)
}

// -----------

function load_program(sprog) {

    clear_program()
    program.next_node_id = parseInt(sprog.next_node_id)
    for(let n in sprog.names_indices)
        program.names_indices[n] = parseInt(sprog.names_idx_s[n])

    for(let nid_s in sprog.nodes) {
        let nid = parseInt(nid_s)
        let sn = sprog.nodes[nid]
        let n = program.add_node(sn.x, sn.y, sn.name, nodes_classes_by_name[sn.cls_name], nid)
        for(let p of n.parameters) {
            let sp = sn.params[p.label]
            if (sp !== undefined) { // might be a new parameter that's not there
                try {
                    p.load(sp)
                }
                catch (e) {
                    console.error("Failed load of parameter", p.label, "in node", sn.name)
                }
            }
        }
    }
    let find_by_name = function (cont, name) {
        for(let o of cont)
            if (o.name == name)
                return o
        return null
    }
    for(let sl of sprog.lines) {
        let from_term = find_by_name(program.nodes_map[sl.from_id].terminals, sl.from_name)
        let to_term = find_by_name(program.nodes_map[sl.to_id].terminals, sl.to_name)
        add_line(new Line(from_term.get_attachment(), to_term.get_attachment()))
    }

    program.display_node = (sprog.display_node_id == null) ? null : program.nodes_map[sprog.display_node_id]
}

function load_state() {
    let state_s = localStorage.getItem("state")
    if (state_s === null)
        return
    //console.log("LOADING: " + state)
    let state = JSON.parse(state_s)
    main_view_state.load(state.main_view_s)
    nodes_view.load(state.nodes_view)
    load_program(state.program)

}
