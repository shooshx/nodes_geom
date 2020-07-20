"use strict"

var vec2 = glMatrix.vec2, mat3 = glMatrix.mat3, mat2 = glMatrix.mat2, glm = glMatrix.glMatrix, vec4 = glMatrix.vec4, vec3 = glMatrix.vec3
glm.setMatrixArrayType(Float64Array)

var ctx_nodes, ctx_img
var ctx_nd_shadow // the canvas_nd_shadow is auxilary for the canvas_nodes for identifying objects
var ctx_img_shadow // canvas_img_shadow auxilary for canvas_image

const PRELOAD_IMAGES = [ "img/check_checked.png", "img/check_int.png", "img/check_none.png",
                         "img/red_ex.png", "img/gray_ex.png",   
                        ]
var preloaded = []

function preload_images() {
    for(var name of PRELOAD_IMAGES) {
        let img = new Image()
        img.src = name
        preloaded.push(img)
    }
}

var scratch_canvas = null // canvas for temporary jobs
var ctx_scratch = null
function ensure_scratch_canvas() {
    if (scratch_canvas !== null)
        return
    scratch_canvas = addTextChild(main_view, "<canvas id='scratch_canvas'></canvas>")
    ctx_scratch = scratch_canvas.getContext('2d')
}

// this causes flicker when displaying an object that has pre_draw() since the canvas resize causes it to clear and then it's only 
// drawn in the next micro-task
function _resize_img_panel(w, h, x, y) {
    if (w !== null) {
        image_panel.style.width = w + "px"
        canvas_image.width = w
    }
    if (h !== null) {
        canvas_image.height = h // Assumes image canvas takes the whole height
    }
    image_panel.style.top = x + "px"
    image_panel.style.left = y + "px"
    image_view.resize_redraw()
}
function _resize_edit_panel(w, h, x, y) {
    if (w !== null) {
        edit_panel.style.width = w + "px"
        canvas_nodes.width = w
        canvas_nd_shadow.width = w
    }
    edit_panel.style.top = x + "px"
    edit_panel.style.left = y + "px"

    draw_nodes()    
}
function _resize_edit_param(w, h) {
    if (h !== null)
        edit_params.style.height = h + 'px';
}
function _resize_nodes_panel(w, h) {
    if (h !== null) {
        edit_nodes.style.height = h + "px"
        canvas_nodes.height = h
        canvas_nd_shadow.height = h
    }
    draw_nodes()              
}

var hover_box = null
function create_global_elems() {
    hover_box = add_div(main_view, "hover_box")
}

function page_onload()
{
    set_loading(true)
    preload_images()
    nodes_view = new NodesView(canvas_nodes)
    image_view = new ImageView()
    ctx_nodes = canvas_nodes.getContext('2d')
    ctx_nd_shadow = canvas_nd_shadow.getContext('2d', {alpha: false})
    ctx_img = canvas_image.getContext('2d')
    ctx_img_shadow = canvas_img_shadow.getContext('2d')
    paper.project = new paper.Project(null)

    create_global_elems()
    
    clear_program()
    try {
        load_state()
    }
    catch(e) {
        console.error("failed load " + e)
    }
    
    setup_vert_splitter(main_view, image_splitter, _resize_img_panel, _resize_edit_panel)
    setup_horz_splitter(edit_panel, edit_splitter, _resize_edit_param, _resize_nodes_panel)
    create_top_menu(main_view)
    
    panel_mouse_control(nodes_view, canvas_nodes)
    panel_mouse_control(image_view, canvas_image)
    panel_mouse_wheel(image_view, canvas_image)
    setup_key_bindings()

    image_view.resize_redraw()
    
    //add_node(-50, -50, null, NodeGeomPrimitive)
    //add_node(50, 50, null, NodePointColor)
    
    draw_nodes()
    calc_img_viewport()

    // manually draw since we're not wrapped in a handler that will call it
    call_frame_draw(true, true)
    clear_draw_req()

    set_loading(false)
}



class Program {
    constructor() {
        this.nodes = [] // nodes in an array for iteration
        this.obj_map = {}  // node-id (obj-id) to node 
        this.lines = []
        this.display_node = null
        // map node cls name to the next index a node of this class is going to get
        this.names_indices = {}
        this.next_obj_id = 1
        this.next_eph_obj_id = 1
        this.tdisp_nodes = [] // template display
        this.input_nodes = []
    }

    // for objects who's id is serialized (node, line)
    // counter is also saved with the program
    alloc_graphic_obj_id() {
        return this.next_obj_id++ 
    }
    // for objects who's id is not serialized (terminals)
    // counter not saved, different namespace but all go into the same obj_map
    alloc_ephemeral_obj_id() {
        return "e" + this.next_eph_obj_id++
    }

    add_node(x, y, name, cls, id) 
    {
        if (name === null) {
            if (this.names_indices[cls.name()] === undefined)
                this.names_indices[cls.name()] = 1
            else
                this.names_indices[cls.name()]++
            name = cls.name().toLowerCase().replace(/[\s-]/g,'_') + "_" + this.names_indices[cls.name()]
        }
        if (id === null || id === undefined) {
            id = this.alloc_graphic_obj_id()
        }
        else {
            console.assert(this.obj_map[id] === undefined, "node-id already exists")
        }
        let node = new Node(x, y, name, cls, id)
        this.obj_map[node.id] = node
        this.nodes.push(node)

        for(let t of node.terminals) {
            t.tuid = this.alloc_ephemeral_obj_id() // not saving these ids anywhere because they're only for display of hover, not referenced by something else
            this.obj_map[t.tuid] = t
        }
        if (this.nodes.length === 1) // first node, display it (also happens in internal programs)
            this.set_display_node(node)

        return node
    }

    
    delete_node(node, redraw)
    {
        if (selected_node == node)
            nodes_unselect_all(false)
        if (this.display_node == node) 
            program.set_display_node(null)
        if (node.disp_template)
            program.set_template_node(node, false)
        if (node.receives_input)
            program.set_input_node(node, false)
        if (node.destructor)
            node.destructor()
        let index = this.nodes.indexOf(node);
        this.nodes.splice(index, 1);        
        delete this.obj_map[node.id];
        for(let t of node.terminals) {
            while(t.lines.length > 0)
                this.delete_line(t.lines[0], false)
            delete this.obj_map[t.tuid];
        }
        
        if (redraw) {
            draw_nodes()
            trigger_frame_draw(true)
        }
    }

    add_line(line, uid) {
        this.lines.push(line)
        if (uid === null || uid === undefined)
            uid = this.alloc_graphic_obj_id()
        line.uid = uid
        this.obj_map[uid] = line
        line.from_term.lines.push(line)
        line.to_term.lines.push(line)
        try {
            line.to_term.get_attachee().tdid_connect(line)  // telling the node into what terminal line was connected
        } catch(e) {}    
        line.to_term.tset_dirty(true) // need function so that it will work for multi in as well
        trigger_frame_draw(true)
    }


    delete_line(line, redraw) {
        try { // might do console.assert to check stuff, don't want it to mess with us
            line.to_term.get_attachee().tdoing_disconnect(line)
        } catch(e) {}
        line.from_term.lines.splice(line.from_term.lines.indexOf(line), 1)
        line.to_term.lines.splice(line.to_term.lines.indexOf(line), 1)
        line.to_term.tset_dirty(true)
        this.lines.splice(this.lines.indexOf(line), 1)
        try { // might do console.assert to check stuff, don't want it to mess with us
            line.to_term.get_attachee().tdid_disconnect(line)
        } catch(e) {}

        if (redraw) {
            draw_nodes()
            trigger_frame_draw(true)
        }
    }


    set_display_node(node, do_draw=true) {
        if (node == this.display_node)
            return
        this.display_node = node
        if (do_draw)
            trigger_frame_draw(true)  // need to do run since the const output might have gotten changed
    }
    
    set_template_node(node, do_draw=true) {
        node.disp_template = !node.disp_template 
        if (node.disp_template)
            this.tdisp_nodes.push(node)
        else {
            const idx = program.tdisp_nodes.indexOf(node)
            console.assert(idx !== -1)
            this.tdisp_nodes.splice(idx, 1);
        }
        if (do_draw)
            trigger_frame_draw(true)
    }
    
    set_input_node(node, do_draw=true) {
        node.receives_input = !node.receives_input
        if (node.receives_input)
            this.input_nodes.push(node)
        else {
            const idx = program.input_nodes.indexOf(node)
            console.assert(idx !== -1)
            this.input_nodes.splice(idx, 1)
        }
        if (do_draw)
            draw_nodes()
    }
    
}

var program = null


function clear_program() {
    nodes_unselect_all(false, false) // don't want to delete the image of the prog just cleared, it's nice that it stays
    program = new Program()
}


function assert(cond, node_cls, msg) {
    console.assert(node_cls.__proto__ instanceof NodeCls, "Assert with the node.cls")
    console.assert(node_cls !== undefined && msg !== undefined)
    if (!cond)
        throw { message: msg, node_cls:node_cls }
}

// thrown in draw (and anywhere alse that's not directly in a node or expression)
function dassert(cond, msg) {
    if (!cond) {
        throw new Error(msg)
    }
}



function calc_img_viewport() {
    let t_viewport = mat3.create()
    image_view.t_viewport = t_viewport
    let f
    if (canvas_image.width > canvas_image.height) {
        f = canvas_image.height*0.5  // half since I want the viewport to be size 2x2
        image_view.margin_x = (canvas_image.width - canvas_image.height) / (canvas_image.height )
        image_view.margin_y = 0
    }
    else {
        f = canvas_image.width*0.5
        image_view.margin_y = (canvas_image.height - canvas_image.width) / (canvas_image.width )
        image_view.margin_x = 0
    }
    image_view.viewport_zoom = f*image_view.zoom // used for measuring radius of hit test in pixels
    mat3.scale(t_viewport, t_viewport, vec2.fromValues(image_view.viewport_zoom, image_view.viewport_zoom))
    mat3.translate(t_viewport, t_viewport, vec2.fromValues(1 + image_view.margin_x + image_view.pan_x / f, 1 + image_view.margin_y + image_view.pan_y / f))
    t_viewport[6] = Math.round(t_viewport[6]) // need to make sure the translation is whole int so that image display would not be interpolated
    t_viewport[7] = Math.round(t_viewport[7])

    image_view.t_inv_viewport = mat3.create()
    mat3.invert(image_view.t_inv_viewport, t_viewport)

    dirty_viewport_dependents()
}

function dirty_viewport_dependents() {
    for(let n of program.nodes) {
        n.cls.dirty_viewport()
    }
}

// a syncronous version of run_nodes_tree to do a pre-run of only the variable
// nodes to set up dirtiness for the real run
function var_run_nodes_tree(n)
{
    if (n._var_visited)
        return
    n._var_visited = true

    // recursive call - first go all the way in to start from the top
    for(let inp_t of n.inputs) {  
        // all lines going into an input
        for(let line of inp_t.lines) {
            var_run_nodes_tree(line.from_term.owner)
        }
    }
    n.cls.nresolve_variables()

    if (n.nkind == KIND_OBJ)  // normal objects node, don't need to do anything more, will be run after dirty analysis
        return

    n._visited = true  // don't want to do progress_io on it again
    // variable producing node
    const this_dirty = n.has_anything_dirty() || !n.has_cached_output()
    if (this_dirty) {
        n.cls.var_run()
    }
    progress_io(n)
    n.clear_dirty()  // this makes it so later in the real run, we won't get to this node
     // it needs to be after progress_io so that the VarBox dirty would propogate as false
}

function progress_io(n)
{
    // distribute outputs to all connected inputs so that all references of an object will be known
    //   still need to do that even if not dirty since inputs are cleared
    for(let out_t of n.outputs) {  
        for(let line of out_t.lines) {
            let obj = line.from_term.get_const()
            assert(obj !== null, n.cls, "No output")
            line.to_term.set(obj)
            //console.log("TERM-SET from ", line.from_term.name, ":", line.from_term.owner.name, "  TO  ", line.to_term.name, ":", line.to_term.owner.name)
        }
    }
    // clear all inputs of the node that just ran just to be safe (they don't take up references)
    for(let inp_t of n.inputs) {
        for(let line of inp_t.lines) {
            line.to_term.clear()
        }
    }
}

function isPromise(x) {
    return Boolean(x && typeof x.then === 'function')
}

async function run_nodes_tree(n) 
{
    console.assert(n._node_dirty !== null)
    if (n._visited)
        return
    n._visited = true
    if (n._node_dirty) {
        // all inputs    
        for(let inp_t of n.inputs) {  
            // all lines going into an input
            for(let line of inp_t.lines) {
                await run_nodes_tree(line.from_term.owner)
            }
        }
        // clear outputs of what's just going to run to make sure it updated its output
        // otherwise it can have something there from a previous iteration
        for(let out_t of n.outputs) {
            out_t.clear()
        }
        const r = n.cls.run()
        if (isPromise(r))
            await r
        n.clear_dirty() // it finished running so it didn't throw and exception
    }

    progress_io(n)
}

function clear_inputs_errors(prog) {
    let had_errors = false
    for(let n of prog.nodes) {
        // but we need to clear them all so there won't be leftovers from last run
        for(let t of n.inputs)
            t.clear() 
        // also clear errors
        had_errors |= (n.cls.get_error() !== null)
        n.cls.clear_error()
    }
    if (had_errors)
        draw_nodes()
}

function do_clear_all(prog) {
    for(let n of prog.nodes) {
        // set the indicator that the node needs to run
        n._node_dirty = true
        n.reeval_all_exprs() // if there are parsing error, trigger them
        // but we need to clear them all so there won't be leftovers from last run
        for(let t of n.outputs)
            t.clear() 
    }
}

// first mark all flags as null so we know who we already visited
function clear_nodes_status(prog) {
    for(let n of prog.nodes) {
        n._node_dirty = null // for caching of output values
        n._visited = false   // for visiting a node during run (and distributing it's output, cached or not to the connections)
        n._var_visited = false // visited by the variables-set recursive run
    } 
}

// go up the tree to find from what point things start to be dirty and need to be re-run
// when a node is found to be dirty (by its parameters), everything under it is also dirty
function mark_dirty_tree(n) {
    if (n._node_dirty !== null) // already been here
        return n._node_dirty
    // all inputs
    for(let inp_t of n.inputs) {  
        // all lines going into an input
        for(let line of inp_t.lines) {
            // if any of the higher nodes is dirty, we're dirty as well
            if (mark_dirty_tree(line.from_term.owner)) {
                n._node_dirty = true
                // can't return just yet since it needs to go over all inputs to mark all as dirty or not
            }
        }
    }
    if (n._node_dirty) // found above
        return true
    let this_dirty = n.has_anything_dirty() || !n.has_cached_output() // no current output means it must run
    n._node_dirty = this_dirty
    return this_dirty
}

// happens when calling run(), clears every iteration
function set_error(node_cls, msg) {
    if (node_cls.get_error() === null)
        node_cls.nset_error({message:msg})
    draw_nodes()
}

var draw_request = {draw:false, do_run:false, clear_all:false}
function trigger_frame_draw(do_run, clear_all=false)  {
    draw_request.draw = true
    draw_request.do_run |= do_run
    draw_request.clear_all |= clear_all
}
function clear_draw_req() {
    draw_request.draw = false
    draw_request.do_run = false
    draw_request.clear_all = false
}

function eventWrapper(func, do_save=true) {
    return function() {
        //console.log("Added event ", event_name, " ", obj)
        //clear_draw_req()
        let r
        try {
            r = func.apply(null, arguments)
        }
        catch(e) {
            if (e.node_cls === undefined) {
                throw e
            }
            clear_draw_req() // don't want the next iteration here to draw
            set_error(e.node_cls, e.message)
            console.error(e)
            return
        }
        
        if (draw_request.draw) {
            if (do_save)  // automatic events like onload shouldn't save since they are not user interaction
                save_state()

            let do_run = draw_request.do_run, clear_all = draw_request.clear_all
            clear_draw_req()
            call_frame_draw(do_run, clear_all)
            clear_draw_req() // in case any run triggered a frame again (happens with shaders that are generated in run()
        }
        return r;    
    }
}

const FLAG_DONT_SAVE = 1

function myAddEventListener(obj, event_name, func, flags=0) {
    const w = eventWrapper(func, flags != FLAG_DONT_SAVE)
    obj.addEventListener(event_name, w)
    return w
}

function stop_propogation_on(event_name, ...elems) {
    for(let e of elems) {
        e.addEventListener(event_name, function(e) {
            e.stopPropagation()            
        })
    }
}


var in_draw = false


function call_frame_draw(do_run, clear_all, done_callback=null) {  // callback for save PNG
    if (in_draw)
        return // avoid starting a call if the previous async call didn't finish yet (indicated several triggers from the same stack)
    in_draw = true
    do_frame_draw(do_run, clear_all).then(()=>{
        if (done_callback)
            done_callback(true)
    }).catch((err)=>{
        if (done_callback)
            done_callback(false)
        console.error(err)
    }).finally( ()=>{ 
        in_draw = false 
        //clear_draw_req()
    })
}

function handle_node_exception(e) {
    if (e.node_cls === undefined) {
        throw e // wasn't thrown from assert
    }
    set_error(e.node_cls, e.message)
    console.error(e)    
}

// called whenever the display needs to be updated to reflect a change
async function do_frame_draw(do_run, clear_all) 
{
    let run_root_nodes = new Set()
    let disp_obj = null

    if (program.display_node === null) { 
        show_display_params(null, null) // remove what's shown
    }
    else {
        run_root_nodes.add(program.display_node)
        disp_obj = program.display_node.outputs[0].get_const() // if there's no output object
    }
    for(let tn of program.tdisp_nodes) {
        run_root_nodes.add(tn)
    }
    if (selected_node !== null) {
        run_root_nodes.add(selected_node)
    }

    if (run_root_nodes.length == 0)
        return

    if (do_run || disp_obj === null) { // last-term: do_run will be false on select but if we don't have anything to display, we still need to run, do this only for the main display object and not for select or template
        if (clear_all)
            do_clear_all(program)
        clear_inputs_errors(program)
        clear_nodes_status(program)
        // first run variable node on the tree and resolve variables on normal nodes since this affects dirtiness of nodes
        let var_run_errors = false
        for(let node of run_root_nodes) {
            try {
                var_run_nodes_tree(node)    
            }
            catch(e) {
                handle_node_exception(e)
                var_run_errors = true
            }
        }
        if (var_run_errors) // if type-checks failed, we don't want run to call dyn_eval and crash
            return
        // anayze dirtiness of the tree and keep for each node if it's dirty
        for(let node of run_root_nodes) // first mark all as dirty
            mark_dirty_tree(node)
        // run the dirty nodes
        for(let node of run_root_nodes) {
            try {
                await run_nodes_tree(node)
            }
            catch(e) {
                handle_node_exception(e)
            }
        }
        if (program.display_node !== null)
            disp_obj = program.display_node.outputs[0].get_const() // in case it was null
    }

    // do this before obj draw so that if there are missing display params, they'll get a default value
    show_display_params(disp_obj, program.display_node) 

    if (program.display_node !== null && disp_obj === null) {
        set_error(program.display_node.cls, "No output generated")
    }

    // do async stuff before the actual draw so that draw can be synchronous
    if (disp_obj !== null) { // can happen if there are only template displays
        try {
            await disp_obj.pre_draw(image_view.t_viewport, program.display_node.display_values)
        } catch(ex) {
            if (program.display_node !== null)
                set_error(program.display_node.cls, ex.message)
        }
    }

    // all syncronouse from here on (don't want to clear the canvas and then leave for a promise, that would cause fliker)
    ctx_img.fillStyle = '#fff'
    ctx_img.fillRect(0, 0, canvas_image.width, canvas_image.height)

    if (disp_obj !== null) {
        try {
            disp_obj.draw(image_view.t_viewport, program.display_node.display_values)
        } catch(e) {
            if (program.display_node !== null)
                set_error(program.display_node.cls, e.message)                    
        }
    }
    if (selected_node !== null) {
        try {
            selected_node.cls.draw_selection(image_view.t_viewport)
        } catch(e) {
            set_error(selected_node.cls, e.message)
        }
    }
    // template displays
    for(let tn of program.tdisp_nodes) {
        const tdist_obj = tn.outputs[0].get_const()
        if (tdist_obj === null) {
            set_error(tn.cls, "No output generated")
            continue
        }
        try {
            tdist_obj.draw_template(image_view.t_viewport)
        } catch(e) {
            set_error(tn.cls, e.message)
        }                
    }    

}



const nodes_classes = [
    { group_name: "Geometry", nodes: [
        NodeGeomPrimitive, 
        NodeManualGeom,
        NodeGeomDivide,
        NodeGeomMerge,
        NodeGeomCopy,
        NodeRandomPoints,
        NodeScatter2,
        NodeTriangulate,
        NodeVoronoi,
        NodeRoundCorners,
        NodeBoolOp,
        NodeOffsetPath,
    ]},
    { group_name: "Image", nodes: [
        NodeLoadImage,
        NodeCreateFrameBuffer,
        NodeShader,
        NodePointGradFill,
        NodeFuncFill,
        NodeGradient,
        NodePixelsToVertices,
    ]},
    NodeSetAttr, 
    NodeTransform,
    NodeGroupObjects,
    NodeVariable,
]
var nodes_classes_by_name = {}
for(let c of nodes_classes) {
    if (c.group_name === undefined)
        nodes_classes_by_name[c.name()] = c
    else
        for(let nc of c.nodes)
            nodes_classes_by_name[nc.name()] = nc
}
// old names from saves
nodes_classes_by_name["Manual_Points"] = NodeManualGeom
nodes_classes_by_name["Shrink Faces"] = NodeOffsetPath
nodes_classes_by_name["Geom_Primitive"] = NodeGeomPrimitive
nodes_classes_by_name["Scatter"] = NodeRandomPoints
nodes_classes_by_name["Scatter2"] = NodeScatter2

