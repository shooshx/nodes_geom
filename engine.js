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

function show_overflow() { // for debugging
    body.style.overflow = "initial"
    main_view.style.overflow = "initial"
    canvas_img_shadow.style.display = "initial"
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

var main_view = null
var hover_box = null
var image_panel = null
var canvas_image = null, canvas_webgl = null, canvas_img_shadow = null
var image_splitter = null
var edit_panel = null
var edit_params = null
var div_params_list = null // recreated when readding params
var div_display_params_cont = null // for disp_params
var edit_splitter = null
var edit_nodes = null
var canvas_nodes = null, canvas_nd_shadow = null

function create_global_elems() {
    main_view = add_div_id(body, null, "main_view")
      image_panel = add_div_id(main_view, null, "image_panel")
        canvas_image = add_elem_id(image_panel, "canvas", null, "canvas_image")
        canvas_webgl = add_elem_id(image_panel, "canvas", null, "canvas_webgl")
        canvas_img_shadow = add_elem_id(image_panel, "canvas", null, "canvas_img_shadow")
      image_splitter = add_div_id(main_view, "splitter", "image_splitter")
      edit_panel = add_div_id(main_view, null, "edit_panel")
        edit_params = add_div_id(edit_panel, null, "edit_params")
          div_params_list = add_div_id(edit_params, null, "div_params_list")
          div_display_params_cont = add_div(edit_params, "div_display_params_cont")
        edit_splitter = add_div_id(edit_panel, "splitter", "edit_splitter")
        edit_nodes = add_div(edit_panel)
          canvas_nodes = add_elem_id(edit_nodes, 'canvas', null, "canvas_nodes")
    canvas_nd_shadow = add_elem_id(body, 'canvas', null, "canvas_nd_shadow")
    hover_box = add_div(main_view, "hover_box")
}

function page_onload()
{
    create_global_elems()
    set_loading(true)
    preload_images()
    nodes_view = new NodesView(canvas_nodes)
    image_view = new ImageView()
    ctx_nodes = canvas_nodes.getContext('2d')
    ctx_nd_shadow = canvas_nd_shadow.getContext('2d', {alpha: false})
    ctx_img = canvas_image.getContext('2d')
    ctx_img_shadow = canvas_img_shadow.getContext('2d')
    paper.project = new paper.Project(null)

    ctx_img.makePath2D = function() { return new Path2D } // allow mocking for SVG save
    ctx_img.need_antialias_gap_fill = true

    clear_program()  // for the case of completely empty state
    
    try {
        load_state()
    }
    catch(e) {
        console.error("failed load " + e)
    }
    
    instrument_canvas_resize(canvas_webgl)
    setup_vert_splitter(main_view, image_splitter, _resize_img_panel, _resize_edit_panel)
    setup_horz_splitter(edit_panel, edit_splitter, _resize_edit_param, _resize_nodes_panel)
    create_top_menu(main_view)
    create_anim_bar()
    
    panel_mouse_control(nodes_view, canvas_nodes, "_nodes")
    panel_mouse_control(image_view, canvas_image, "_image")
    panel_mouse_wheel(image_view, canvas_image)
    panel_mouse_wheel(nodes_view, canvas_nodes)
    setup_key_bindings()

    image_view.resize_redraw()
    
    //add_node(-50, -50, null, NodeGeomPrimitive)
    //add_node(50, 50, null, NodePointColor)
    
    draw_nodes()
    calc_img_viewport()

    // manually draw since we're not wrapped in a handler that will call it
    //call_frame_draw(true, true)
    anim_frame()
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
        this.glob_var_nodes = [] // runs before the display node
        this.tdisp_nodes = [] // template display
        this.input_nodes = []
        this.nodes_decor = [] // non-functional decorations in the nodes view

        this.anim_flow = new AnimFlow()
    }

    // for objects who's id is serialized (node, line)
    // counter is also saved with the program
    alloc_graphic_obj_id() {
        return this.next_obj_id++ 
    }
    // for objects who's id is not serialized (terminals)
    // counter not saved, different namespace but all go into the same obj_map
    alloc_ephemeral_obj_id(t) {
        const id = "e" + this.next_eph_obj_id++
        this.obj_map[id] = t
        return id
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
        let node = new Node(x, y, name, cls, id, this)
        this.obj_map[node.id] = node
        this.nodes.push(node)

        for(let t of node.terminals) {
            t.tuid = this.alloc_ephemeral_obj_id(t) // not saving these ids anywhere because they're only for display of hover, not referenced by something else
        }
        if (this.nodes.length === 1 && node.nkind === KIND_OBJ) // first node, display it (also happens in internal programs)
            this.set_display_node(node)

        return node
    }

    
    delete_node(node, redraw)
    {
        if (node.is_selected_inf !== null)
            node.unselect()
        if (this.display_node == node) 
            program.set_display_node(null)
        if (node.disp_template)
            program.set_template_node(node, false)
        if (node.receives_input)
            program.set_input_node(node, false)
        if (node.enable_active) {
            node.cls.toggle_enable_flag(false, false)
        }
        if (obj_inf_dlg !== null)
            obj_inf_dlg.node_deleted(node)
        if (node.destructor)
            node.destructor()
        arr_remove_is(this.nodes, node)
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

    add_line(line, uid, redraw) {
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
        if (redraw)
            trigger_frame_draw(true)
    }


    delete_line(line, redraw) {
        try { // might do console.assert to check stuff, don't want it to mess with us
            line.to_term.get_attachee().tdoing_disconnect(line)
        } catch(e) {}
        arr_remove_is(line.from_term.lines, line)
        arr_remove_is(line.to_term.lines, line)
        line.to_term.clear()
        line.to_term.tset_dirty(true)
        arr_remove_is(this.lines, line)
        delete this.obj_map[line.uid]

        try { // might do console.assert to check stuff, don't want it to mess with us
            line.to_term.get_attachee().tdid_disconnect(line)
        } catch(e) {}

        if (redraw) {
            draw_nodes()
            trigger_frame_draw(true)
        }
    }

    delete_lines_of(term) {
        while(term.lines.length > 0)
            this.delete_line(term.lines[0], false)
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
            arr_remove_is(program.tdisp_nodes, node)
        }
        if (do_draw)
            trigger_frame_draw(true)
    }

    set_glob_var_node(node, do_draw, to_value) {
        node.set_enable_active_dirty(to_value)
        if (node.enable_active) {
            this.glob_var_nodes.push(node)
        }
        else {
            arr_remove_is(program.glob_var_nodes, node)
        }
        if (do_draw)
            trigger_frame_draw(true)
    }

   
    set_input_node(node, do_draw=true) {
        node.receives_input = !node.receives_input
        if (node.receives_input)
            this.input_nodes.push(node)
        else {
            arr_remove_is(program.input_nodes, node)
        }
        if (do_draw)
            draw_nodes()
    }
    
    nodes_add_decor(obj, uid=null) {
        if (uid === null || uid === undefined)
            uid = this.alloc_graphic_obj_id()
        obj.uid = uid
        this.nodes_decor.push(obj)
        this.obj_map[obj.uid] = obj
    }
    delete_decor(obj) {
        arr_remove_is(this.nodes_decor, obj)
        delete this.obj_map[obj.uid];
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

function is_obj_p(p) {
    return p.kind === KIND_OBJ || p.kind === KIND_VARS
}
function is_obj_n(p) {
    return p.nkind === KIND_OBJ || p.nkind === KIND_VARS
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


function collect_line(line) {
    const obj = line.from_term.get_ctrl_block()
    assert(obj !== null, line.from_term.owner.cls, "No output from node " + line.from_term.owner.name)
    line.to_term.intr_set(obj, line.from_term.get_cur_uver())
}

function collect_inputs(n)
{
    for(let in_t of n.inputs) {
        if (!is_obj_p(in_t))
            continue
        in_t.collect_terminal()
    }
}

function isPromise(x) {
    return Boolean(x && typeof x.then === 'function')
}

function lines_list_subtract(total, picked) {
    const ret = []
    for(let t of total) {
        let found = false
        for(let p of picked) {
            if (t === p) {
                found = true
                break
            }
        }
        if (!found)
            ret.push(t)
    }
    return ret
}

// returns true if the argument node was dirty of out of its parents is was dirty
// picked = false if this is an un-picked branch (which still needs to resolve variables)
async function run_nodes_tree(n, picked) 
{
    //console.assert(n._node_dirty !== null)
    if (n._last_visited_fv == frame_ver)
        return
    n._last_visited_fv = frame_ver

    const node_picking_lines = n.cls.is_picking_lines()
    let parent_dirty = false

    // all inputs, including var
    for(let inp_t of n.inputs) {  
        if (!is_obj_p(inp_t))
            continue // flow nodes are not supposed to be run recursively (relevant when resolving vars for a flow node)
        // all lines going into an input
        let run_lines = inp_t.lines, not_picked_lines = null
        if (node_picking_lines && inp_t.kind === KIND_OBJ) {// var terminal doesn't participate in picking (always runs)
            run_lines = n.cls.pick_lines(inp_t)
            not_picked_lines = lines_list_subtract(inp_t.lines, run_lines)
        }
        
        for(let line of run_lines) {
            parent_dirty |= await run_nodes_tree(line.from_term.owner, picked)
        }
        if (not_picked_lines !== null) {
            // on unpicked branches, we still want to resolve variables so that online params would work (with variables)
            for(let line of not_picked_lines) {
                await run_nodes_tree(line.from_term.owner, false)
            }
        }
    }

    // resolve globals like frame_num that can affect dirtiness
    n.cls.nresolve_variables(true) 

    if (!picked)
        return false // non-picked branch should not set dirtiness

    const this_dirty = n.has_anything_dirty(parent_dirty) || (is_obj_n(n) && !n.has_cached_output())

    // if we're on a not-picked branch, don't run, the output is not going to be used
    if (this_dirty) {

        // clear outputs of what's just going to run to make sure it updated its output
        // otherwise it can have something there from a previous iteration (which will stay there in case of an error)
        // shouldn't be before running the inputs since that causes error in animation loops
        if (n.cls.should_clear_out_before_run()) // disabled for NodeChangeFilter so that it won't create new versions when there's no change
            for(let out_t of n.outputs) {
                out_t.clear()
            }


        if (!node_picking_lines) // a node that's picking lines, also does its own collect
            collect_inputs(n)
        else
            n.cls.vars_in.collect_terminal() // need to do this here never-the-less so that resolve would work, this is ok since pick-one node isn't interested in picking the variable terminal
        n.cls.nresolve_variables(false)
    
        if (!n.check_params_errors())
            throw { message: "Parameter error", node_cls:n.cls }  // abort if there are any errors

        const r = n.cls.run()
        if (isPromise(r))
            await r

        n.clear_dirty() // it finished running so it didn't throw and exception
    }

    return this_dirty
}

function clear_inputs_errors(prog) {
    let had_errors = false
    for(let n of prog.nodes) {
        // but we need to clear them all so there won't be leftovers from last run
     //   for(let t of n.inputs)  disabled, see progress_io
     //       t.clear() 
        // also clear errors
        had_errors |= (n.cls.get_error() !== null)
        n.cls.clear_error()
    }
    if (had_errors)
        draw_nodes() // show error in node view
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

function eventWrapper(func, event_name, do_save=true) {
    return function() {
        //console.log("-event ", event_name)
        // clear any event that happened in async microtasks triggered by the previous draw and before this was called again
        // we want to just get the events that happen during func()
        clear_draw_req() 
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
        
        // if animation is running calling this would interfere with the animation frame-count and animation state, so don't
        if (draw_request.draw && !g_anim.run) {
            if (do_save)  // automatic events like onload shouldn't save since they are not user interaction
                save_state()

            const do_run = draw_request.do_run, clear_all = draw_request.clear_all
            //console.log("-event-draw ", event_name, " do-run=", do_run, "  clear=", clear_all)
            clear_draw_req()
            
            call_frame_draw(do_run, clear_all)
            clear_draw_req() // in case any run triggered a frame again (happens with shaders that are generated in run()
        }
        return r;    
    }
}

const FLAG_DONT_SAVE = 1

function myAddEventListener(obj, event_name, func, flags=0) {
    const w = eventWrapper(func, event_name + "-" + obj, flags != FLAG_DONT_SAVE)
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


async function call_frame_draw(do_run, clear_all, done_callback=null) {  // callback for save PNG
    if (in_draw) {
        return null // avoid starting a call if the previous async call didn't finish yet (indicated several triggers from the same stack)
    }
    in_draw = true

    try {
        const ret = await do_frame_draw(do_run, clear_all)
        if (done_callback)
            done_callback(true)
        return ret
    }
    catch (err) {
        if (done_callback)
            done_callback(false)
        console.error(err)
        return null
    }
    finally {
        in_draw = false 
        //clear_draw_req()
    }
    
}

function handle_node_exception(e) {
    if (e.node_cls === undefined) {
        throw e // wasn't thrown from assert
    }
    set_error(e.node_cls, e.message)
    console.error(e)    
}

function get_display_object() { // for shadow select
    if (program.display_node === null)
        return null
    return program.display_node.outputs[0].get_const() 
}

var frame_ver = 1 // always ascending id of the frame, for modern dirty analysis


function get_nodes_to_run()
{
    const run_root_nodes = new Set()
    let disp_obj = null

    for(let gn of program.glob_var_nodes) // these need to be first so that global would be there for eval. Set is order preserving
        run_root_nodes.add(gn)
    if (program.display_node === null) { 
        show_display_params(null, null) // remove what's shown
    }
    else {
        run_root_nodes.add(program.display_node)
        disp_obj = program.display_node.outputs[0].get_const() // if there's no output object
    }

    for(let tn of program.tdisp_nodes) 
        run_root_nodes.add(tn)
    if (selected_nodes.length > 0)
        for(let sn of selected_nodes)
            if (sn.can_run_on_select)
                run_root_nodes.add(sn)
    return [run_root_nodes, disp_obj]
}

function clear_img_canvas() {
    ctx_img.fillStyle = '#fff'
    ctx_img.fillRect(0, 0, canvas_image.width, canvas_image.height)
}

// called whenever the display needs to be updated to reflect a change
async function do_frame_draw(do_run, clear_all) 
{
    fps_counter_update()
    canvas_webgl.reset_to_latest_max()

    // needs to be first so that variable nodes in the flow would have a chance to run first
    const anim_traits = await program.anim_flow.pget_anim_traits()

    let [run_root_nodes, disp_obj] = get_nodes_to_run()
        
    if (run_root_nodes.size > 0 && (do_run || disp_obj === null)) { // last-term: do_run will be false on select but if we don't have anything to display, we still need to run, do this only for the main display object and not for select or template
        if (clear_all) {
            try {
                do_clear_all(program)
            }
            catch(e) { // can happen if some peval failed
                console.error("Error in do_clear_all: " + e)
                return null
            }
        }
        clear_inputs_errors(program)
 
        let disp_node_error = false
        for(let node of run_root_nodes) {
            try {
                await run_nodes_tree(node, true)
            }
            catch(e) {
                handle_node_exception(e)
                if (node === program.display_node)
                    disp_node_error = true
            }
        }
        if (disp_node_error) // don't want to continue displaying something that came out of a node that had an error up in its chain
            disp_obj = null
        else if (program.display_node !== null)
            disp_obj = program.display_node.outputs[0].get_const() // in case it was null
    }


    if (!anim_traits.render) {
        ++frame_ver
        return anim_traits
    }

    // do this before obj draw so that if there are missing display params, they'll get a default value
    show_display_params(disp_obj, program.display_node) 

    if (program.display_node !== null && disp_obj === null) {
        set_error(program.display_node.cls, "No output generated")
    }

    // do async stuff before the actual draw so that draw can be synchronous
    if (disp_obj !== null) { // can get here if there are only template displays do need to do this check
        try {
            await disp_obj.pre_draw(image_view.t_viewport, program.display_node.display_values)
        } catch(ex) {
            if (program.display_node !== null)
                set_error(program.display_node.cls, ex.message)
        }
    }

    // all syncronouse from here on (don't want to clear the canvas and then leave for a promise, that would cause fliker)
    clear_img_canvas()
    phy_reset_current_worlds() // draw of the world re-adds only the active ones

    if (disp_obj !== null) {
        try {
            disp_obj.draw(image_view.t_viewport, program.display_node.display_values)
        } catch(e) {
            if (program.display_node !== null)
                set_error(program.display_node.cls, e.message)                    
        }
    }
    if (selected_nodes.length > 0) {
        for(let sn of selected_nodes) {
            try {
                sn.cls.draw_selection(image_view.t_viewport)
            } catch(e) {
                set_error(sn.cls, e.message)
            }
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

    ++frame_ver
    return anim_traits
}

function get_output_term_of_kind(node, kind) {
    for(let tn of node.outputs)
        if (tn.kind == kind) 
            return tn
    return null
}

// traces where the animation flow is in the program
class AnimFlow
{
    constructor() {
      //  this.start_node = null
        this.current_node = null
        this.event_nodes = []

        this.default_anim_traits = new AnimTraits()
    }

   /* set_anim_node(node)
    {
        if (node !== null)
            node.enable_active = !node.enable_active 
        if (this.start_node === node)
            this.start_node = null
        else
            this.start_node = node
        this.reset_anim_flow()
    }*/

    toggle_event_node(node) 
    {
        node.enable_active = !node.enable_active 
        if (node.enable_active) {
            this.event_nodes.push(node)
        }
        else {
            arr_remove_is(this.event_nodes, node)
        }
    }


   /* reset_anim_flow()
    {
        this.current_node = this.start_node
    }*/

    async check_events() {
        for(let evn of this.event_nodes) {
            evn.cls.clear_flow_hijack()
            await run_nodes_tree(evn, true)
            const want = evn.cls.want_flow_hijack()
            if (want) {
                this.current_node = evn
                return true
            }
        }
        return false
    }

    async pget_anim_traits()
    {
        await this.check_events() // event can change current_node
        // if there's no events, we should, there can't be any active flow, so we should also be at the default traits
        if (this.current_node === null || this.event_nodes.length == 0) {
            return this.default_anim_traits
        }
        let t = null
        // loop until we find a node that doesn't forward to next
        do { 
            // anything connected to the vars_in? if so, need to run it
            if (this.current_node === null)
                t = this.default_anim_traits
            else {
                await run_nodes_tree(this.current_node, true)
                // by-design, this does not made to trigger more events since events are triggered just once in a frame
                // otherwise it would cause loops and it's not possible to know what got dirtied since frame_ver is not incremented.
                // frame_ver can't be incremented here since that would mess with variable dirty check
               // console.log("calling ", this.current_node.name)
                t = this.current_node.cls.get_anim_traits()
            }

            if (t.next) {
                const next_node = get_output_term_of_kind(this.current_node, KIND_FLOW_ANIM)
                if (next_node.lines.length === 0) // nothing to transfer to, go to default
                    this.current_node = null
                else {
                    const nx = next_node.lines[0].to_term.owner
                    if (nx !== this.current_node) {
                        this.current_node.cls.exiting()
                        this.current_node = nx
                        this.current_node.cls.entered()
                    }
                }
                //console.log("Flowed to ", this.current_node.name)
            }
            // TBD detect loop?
        } while(t.next)

        return t
    }
}

class Animation {
    constructor() {
        //this.frame_time = 0;
        this.run = false;  // running right now?
        this.pre_draw_handlers = []
        this.globals_vars_box = new VariablesObj()
        this.frame_num_box = new VarBox()
        this.frame_num_box.vbset(-1, TYPE_NUM)
        this.globals_vars_box.add("frame_num", this.frame_num_box)
        this.start_time = null
        this.frame_time = 0
        this.fixed_refs = [ this.globals_vars_box.make_ref("frame_num") ] // prevent these from releasing by taking a reference to them
    }
    rewind() {
        this.frame_num_box.vbset(-1, TYPE_NUM)
        const did_run = this.run
        this.run = false
       // program.anim_flow.reset_anim_flow()
        if (!did_run)
            window.requestAnimationFrame(anim_frame)
    }
    start() {
        this.run = true
        this.start_time = performance.now()
        window.requestAnimationFrame(anim_frame)
    }
    pause() {
        this.run = false
    }
    one_next() {
        this.run = false
        window.requestAnimationFrame(anim_frame)
    }

    set_frame_num(num) { //from UI
        if (this.run)
            return
        this.frame_num_box.vbset(num, TYPE_NUM)    
        window.requestAnimationFrame(anim_frame)
    }

    reg_pre_draw(func) {
        this.pre_draw_handlers.push(func)
    }
    notify_pre_draw() {
        for(let handler of this.pre_draw_handlers)  // update UI
            handler(g_anim.frame_num_box.v, this.frame_time, this.run)        
    }
}

var g_anim = new Animation()

async function anim_frame()
{
    let anim_traits = null
    let frames_at_once = 1, iter = 0

    while(iter < frames_at_once)
    {
        g_anim.frame_num_box.vbset(g_anim.frame_num_box.v + 1, TYPE_NUM)
        g_anim.notify_pre_draw() // show the number that we just set

        //g_anim.frame_time = performance.now() - g_anim.start_time
        anim_traits = await call_frame_draw(true, false, null)
        // ret can be null if we're already in a draw somewhere else
        if (anim_traits === null)
            anim_traits = g_anim.default_anim_traits

        ++iter
        if (anim_traits.frame_rate === FRAME_RATE_MAX && g_anim.run)
            frames_at_once = anim_traits.blocking_frames
        else 
            break
    }

    if (!g_anim.run) 
        return

    if (anim_traits.frame_rate === FRAME_RATE_NORMAL)
        window.requestAnimationFrame(anim_frame)
    else if (anim_traits.frame_rate === FRAME_RATE_MAX)
        //window.setTimeout(anim_frame, 0)
        setZeroTimeout()
    else
        dassert(false, "unexpected frame_rate")
}


const messageName = 424242;
function setZeroTimeout() {
    window.postMessage(messageName, "*");
}
function handleMessage(event) {
    if (event.source == window && event.data == messageName) {
        event.stopPropagation();
        anim_frame()
    }
}
window.addEventListener("message", handleMessage, true);



const nodes_classes = [
    { group_name: "Geometry", nodes: [
        NodeGeomPrimitive, 
        NodeManualGeom,
        NodeGeomDivide,
        NodeSetAttr, 
        NodeConstAttr,
        NodeGeomMerge,
        NodeGeomSplit,
        NodeGeomCopy,
        NodeRandomPoints,
        NodeScatter2,
        NodeTriangulate,
        NodeVoronoi,
        NodeRoundCorners,
        NodeBoolOp,
        NodeOffsetPath,
        NodePen,
    ]},
    { group_name: "Image", nodes: [
        NodeLoadImage,
        NodeCreateFrameBuffer,
        NodeShader,
        NodePointGradFill,
        NodeFuncFill,
        NodeImageProc,
        NodeGradient,
        NodePixelsToVertices,
        NodeSampleColor
    ]},
    { group_name: "Distance Field", nodes: [
        NodeDFPrimitive,
        NodeDFFromGeom,
        NodeDFCombine,
        NodeDFCopy,
        NodeDFImage,
        NodeMarchingSquares
    ]},
    { group_name: "Flow", nodes: [
        NodePickOne,
        NodeChangeFilter,
      //  AnimStartFlow,
        AnimEventFlow,
        AnimSpan,
        FlowVariable
    ]},
    { group_name: "Physics", nodes: [
        NodeB2Body,
        NodeB2Joint,
        NodeB2Merge,
        NodeB2Sim,
        NodeExtractTransform,
    ]},
    { group_name: "Variables", nodes: [
        NodeVariable,
        NodeVarStep
    ]},
    { group_name: "Groups", nodes: [
        NodeGroupObjects,
        NodeGroupSelect
    ]},
    { group_name: "I/O", nodes: [
        NodeHTTPSend
    ]},
    NodeTransform,
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
nodes_classes_by_name["Distance Field Primitive"] = NodeDFPrimitive
nodes_classes_by_name["Distance Field Combine"] = NodeDFCombine
nodes_classes_by_name["Event Flow"] = AnimEventFlow

var nodes_decor = [
    NV_TextNote
]
var nodes_decor_by_name = {}
for(let d of nodes_decor)
    nodes_decor_by_name[d.name()] = d