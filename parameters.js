
class Parameter
{
    constructor(node, label) {
        this.label = label
        this.label_elem = null  // use for changing the label 
        this.line_elem = null  // used for enable
        this.enable = true
        node.parameters.push(this)
        // don't save node, this param may go other places
    }
    set_label(text) {
        this.label = text
        if (this.label_elem !== null) // can be null if we call this before displaying elements
            this.label_elem.innerText = text
    }
    set_enable(v) {
        this.enable = v
        if (this.line_elem !== null)
            this.line_elem.classList.toggle("param_disabled", !this.enable)
    }
    init_enable() {
        if (this.line_elem !== null && !this.enable)
            this.line_elem.classList.toggle("param_disabled", !this.enable)
    }
}

function add_param_line(parent) {
    let e = document.createElement("div");
    e.classList = ['param_line']
    parent.appendChild(e)
    return e
}
function add_param_label(line, text) {
    let e = document.createElement('span')
    if (text != null) {
        e.innerText = text
        e.className = 'param_label_pre'
    }
    else
        e.className = 'param_label_pre_empty'
    line.appendChild(e)
    if (text != null) {
        let colon = document.createElement('span')
        colon.className = 'param_label_colon'    
        colon.innerText = ':'  // can't just concatenate this above since the label may change
        line.append(colon)
    }
    return e
}
function add_param_edit(line, value, set_func) {
    let e = document.createElement('input')
    e.className = 'param_input'
    e.type = 'text'
    e.spellcheck = 'false'
    e.value = value
    // TBD parse error
    e.addEventListener("input", function() { set_func(e.value); trigger_frame_draw() })
    line.appendChild(e)
    return e
}
function add_param_color(line, value, set_func) {
    let e = document.createElement('input')
    e.className = 'param_input'
    line.appendChild(e)
    // TBD move setting the func to be the last thing to avoid spurious triggers
    let ce = ColorEditBox.create_at(e, 200, function(c) { if (set_func(c)) trigger_frame_draw() })
    ce.set_color(value, true)
    return ce.get_color().copy()
}
let checkbox_ids = 1
function add_param_checkbox(line, label, value, set_func) {
    let ein = document.createElement('input')
    ein.type = 'checkbox'
    ein.className = 'param_checkbox_input'
    ein.id = 'p_chb_' + checkbox_ids
    ein.checked = value
    ein.addEventListener('change', function() { set_func(ein.checked) })
    let edisp = document.createElement('label')
    edisp.className = 'param_checkbox_disp'
    edisp.setAttribute("for", ein.id)
    let etext = document.createElement('label')
    etext.className = 'param_checkbox_text'
    etext.setAttribute("for", ein.id)
    etext.innerText = label
    line.append(ein)
    line.append(edisp)
    line.append(etext)
    return etext
}


class ParamInt extends Parameter {
    constructor(node, label, start_v) {
        super(node, label)
        this.v = start_v
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        let that = this
        add_param_edit(this.line_elem, this.v, function(v) { that.v = parseInt(v) }) // TBD enforce int with parsing
    }
}

class ParamBool extends Parameter {
    constructor(node, label, start_v, change_func) {
        super(node, label)
        this.v = start_v
        this.change_func = change_func
    }
    save() { return {v:this.v} }
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        add_param_label(this.line_elem, null)  // empty space
        let that = this
        this.label_elem = add_param_checkbox(this.line_elem, this.label, this.v, function(v) { 
            that.v = v; 
            if (that.change_func) 
                that.change_func(v) 
        })
    }
}

class ParamVec2 extends Parameter {
    constructor(node, label, start_x, start_y) {
        super(node, label)
        this.x = start_x
        this.y = start_y
    }
    save() { return {x:this.x, y:this.y} }
    load(v) { this.x=v.x; this.y=v.y }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        let that = this
        add_param_edit(this.line_elem, this.x, function(v) { that.x = parseFloat(v) })
        add_param_edit(this.line_elem, this.y, function(v) { that.y = parseFloat(v) })
    }
}

class ParamColor extends Parameter {
    constructor(node, label, start_c_str) {
        super(node, label)
        this.v = ColorPicker.parse_hex(start_c_str)
    }
    save() { return this.v.hex }
    load(v) { this.v = ColorPicker.parse_hex(v) }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        let that = this
        this.v = add_param_color(this.line_elem, this.v, function(v) { 
            if (that.v.hex == v.hex) 
                return false; 
            that.v = v.copy() // make a copy so that this.v will be different object than the internal object
            return true
        })
    }
}

class ParamTransform extends Parameter {
    constructor(node, label) {
        super(node, label)
        this.translate = vec2.fromValues(0,0)
        this.rotate = 0
        this.scale = vec2.fromValues(1,1)
        this.v = mat3.create()
    }
    save() { return {t:this.translate, r:this.rotate, s:this.scale} }
    load(v) { this.translate[0] = v.t[0]; this.translate[1] = v.t[1]; this.rotate = v.r; this.scale[0] = v.s[0]; this.scale[1] = v.s[1]; this.calc_mat() }
    calc_mat() {
        mat3.identity(this.v)
        mat3.scale(this.v, this.v, this.scale)
        mat3.rotate(this.v, this.v, glm.toRadian(this.rotate))
        mat3.translate(this.v, this.v, this.translate)
    }
    add_elems(parent) {  // TBD support enable
        let that = this
        let line1 = add_param_line(parent)
        add_param_label(line1, "Translate")
        add_param_edit(line1, this.translate[0], function(v) { that.translate[0] = v; that.calc_mat() })
        add_param_edit(line1, this.translate[1], function(v) { that.translate[1] = v; that.calc_mat()})
        let line2 = add_param_line(parent)
        add_param_label(line2, "Rotate")
        add_param_edit(line2, this.rotate, function(v) { that.rotate = v; that.calc_mat()})
        let line3 = add_param_line(parent)
        add_param_label(line3, "Scale")
        add_param_edit(line3, this.scale[0], function(v) { that.scale[0] = v; that.calc_mat()})
        add_param_edit(line3, this.scale[1], function(v) { that.scale[1] = v; that.calc_mat()})
    }
}


function show_params_of(node) {
    // clear children
    let div_params_list = document.getElementById('div_params_list')
    var cNode = div_params_list.cloneNode(false);
    div_params_list.parentNode.replaceChild(cNode, div_params_list);
    div_params_list = cNode
    if (node === null)
        return
    
    for(let p of node.parameters) {
        p.add_elems(div_params_list)
        p.init_enable()
    }
}
