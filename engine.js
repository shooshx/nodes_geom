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
function _resize_img_panel(w, h) {
    if (w !== null) {
        image_panel.style.width = w + "px"
        canvas_image.width = w
    }
    if (h !== null) {
        canvas_image.height = h // Assumes image canvas takes the whole height
    }
    image_view.resize_redraw()
}
function _resize_edit_panel(w, h) {
    if (w !== null) {
        edit_panel.style.width = w + "px"
        canvas_nodes.width = w
        canvas_nd_shadow.width = w
    }
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
        this.obj_map = {}  // node-id to node 
        this.lines = []
        this.display_node = null
        // map node cls name to the next index a node of this class is going to get
        this.names_indices = {}
        this.next_obj_id = 1
        this.tdisp_nodes = [] // template display
    }

    alloc_graphic_obj_id() {
        return this.next_obj_id++ 
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
        var node = new Node(x, y, name, cls, id)
        this.obj_map[node.id] = node
        this.nodes.push(node)

        for(let t of node.terminals) {
            t.tuid = this.alloc_graphic_obj_id() // not saving these ids anywhere because they're only for display of hover, not referenced by something else
            this.obj_map[t.tuid] = t
        }
        return node
    }

    
    delete_node(node, redraw)
    {
        if (selected_node == node)
            nodes_unselect_all(false)
        if (this.display_node == node) 
            set_display_node(null)
        if (node.destructor)
            node.destructor()
        var index = this.nodes.indexOf(node);
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
        line.to_term.get_attachee().owner.cls.did_connect(line.to_term.get_attachee(), line) 
        line.to_term.tset_dirty(true) // need function so that it will work for multi in as well
        trigger_frame_draw(true)
    }


    delete_line(line, redraw) {
        try {
            line.to_term.get_attachee().owner.cls.doing_disconnect(line.to_term.get_attachee(), line)
        } catch(e) {}
        line.from_term.lines.splice(line.from_term.lines.indexOf(line), 1)
        line.to_term.lines.splice(line.to_term.lines.indexOf(line), 1)
        line.to_term.tset_dirty(true)
        this.lines.splice(this.lines.indexOf(line), 1)
        if (redraw) {
            draw_nodes()
            trigger_frame_draw(true)
        }
    }

}

var program = null


function clear_program() {
    program = new Program()
}


function assert(cond, node_cls, msg) {
    console.assert(node_cls.__proto__ instanceof NodeCls, "Assert with the node.cls")
    console.assert(node_cls !== undefined && msg !== undefined)
    if (!cond)
        throw { message: msg, node_cls:node_cls }
}

// thrown in draw
function dassert(cond, msg) {
    if (!cond)
        throw new Error(msg)
}

// throw in expressions
function eassert(cond, msg) {
    if (!cond)
        throw new ExprErr(msg)
}



function calc_img_viewport() {
    let t_viewport = mat3.create()
    image_view.t_viewport = t_viewport

    if (canvas_image.width > canvas_image.height) {
        var f = canvas_image.height*0.5  // half since I want the viewport to be size 2x2
        image_view.margin_x = (canvas_image.width - canvas_image.height) / (canvas_image.height )
        image_view.margin_y = 0
    }
    else {
        var f = canvas_image.width*0.5
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


async function run_nodes_tree(n) {
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
        for(let out_t of n.outputs) {
            out_t.clear()
        }
        await n.cls.run()
        n.clear_dirty() // it finished running so it didn't throw and exception
    }
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

function clear_outputs(prog) {
    for(let n of prog.nodes) {
        // set the indicator that the node needs to run
        n._node_dirty = true
        // but we need to clear them all so there won't be leftovers from last run
        for(let t of n.outputs)
            t.clear() 
    }
}

// first mark all flags as null so we know who we already visited
function clear_nodes_status(prog) {
    for(let n of prog.nodes) {
        n._node_dirty = null // for caching of output values
        n._visited = false   // for visiting a node (and distributing it's output, cached or not to the connections)
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
    let this_dirty = n.has_anything_dirty() || n.outputs[0].get_const() === null
    n._node_dirty = this_dirty
    return this_dirty
}

// happens when calling run(), clears every iteration
function set_error(node_cls, msg) {
    if (node_cls.error === null)
        node_cls.error = {message:msg}
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

function myAddEventListener(obj, event_name, func) {
    obj.addEventListener(event_name, function() {
        //console.log("Added event ", event_name, " ", obj)
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
            let do_run = draw_request.do_run, clear_all = draw_request.clear_all
            clear_draw_req()
            call_frame_draw(do_run, clear_all)
            clear_draw_req() // in case any run triggered a frame again (happens with shaders that are generated in run()
        }
        return r;
    })
}

function stop_propogation_on(event_name, ...elems) {
    for(let e of elems) {
        e.addEventListener(event_name, function(e) {
            e.stopPropagation()            
        })
    }
}

// just redraw the same output
const RUN_DRAW_SAME = 0
// the viewport change, re-run anything that is viewport dependent
//const RUN_VIEW_CHANGED = 1
// something in the nodes changed, run with output cacheing
const RUN_NODE_CHANGED = 2
// re-run everything
const RUN_ALL = 3

var in_draw = false


function call_frame_draw(do_run, clear_all) {
    if (in_draw)
        return // avoid starting a call if the previous async call didn't finish yet (indicated several triggers from the same stack)
    in_draw = true
    do_frame_draw(do_run, clear_all).then(()=>{}, (err)=>{ throw err }).catch(()=>{

    }).finally( ()=>{ 
        in_draw = false 
        //clear_draw_req()
    })
}

// called whenever the display needs to be updated to reflect a change
async function do_frame_draw(do_run, clear_all) 
{
    save_state()

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

    if (do_run || disp_obj === null) { // TBD or template objs that are not you created?
        if (clear_all)
            clear_outputs(program)
        clear_inputs_errors(program)
        clear_nodes_status(program)
        for(let node of run_root_nodes) // first mark all as dirty
            mark_dirty_tree(node)
        for(let node of run_root_nodes) {
            try {
                await run_nodes_tree(node)
            }
            catch(e) {
                if (e.node_cls === undefined) {
                    throw e
                }
                set_error(e.node_cls, e.message)
                console.error(e)
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
            set_error(tn, "No output generated")
            continue
        }
        try {
            tdist_obj.draw_template(image_view.t_viewport)
        } catch(e) {
            set_error(tn.cls, e.message)
        }                
    }    

}



var nodes_classes = [
    //NodeTestDummy, 
    NodeShader,
    NodeGeomPrimitive, 
    NodeManualGeom,
    NodeGradient,
    GeomDivide,
    NodeSetAttr, 
    //NodeGeomMerge, 
    NodeGroupObjects,
    NodeTransform,
    NodeRandomPoints,
    NodeTriangulate,
    NodeVoronoi,
    NodeShader,
    PointGradFill,
    NodeLoadImage,
    CreateFrameBuffer,
    ShrinkFaces,
    NodeRoundCorners,
    NodeFuncFill,
    NodeBoolOp,
    NodeVariable,
]
var nodes_classes_by_name = {}
for(let c of nodes_classes)
    nodes_classes_by_name[c.name()] = c
// old names from saves
nodes_classes_by_name["Manual_Points"] = NodeManualGeom

