
class Parameter
{
    constructor(node, label) {
        this.label = label
        node.parameters.push(this)
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
    e.classList = ['param_label_pre']
    e.innerText = text + ":"
    line.appendChild(e)
    return e
}
function add_param_edit(line, value, set_func) {
    let e = document.createElement('input')
    e.className = 'param_input'
    e.type = 'text'
    e.spellcheck = 'false'
    e.value = value
    e.addEventListener("input", function() { set_func(e.value); trigger_frame_draw() })
    line.appendChild(e)
    return e
}
function add_param_color(line, value, set_func) {
    let e = document.createElement('input')
    e.className = 'param_input'
    line.appendChild(e)
    let ce = ColorEditBox.create_at(e, 200, function(c) { set_func(c); trigger_frame_draw() })
    ce.set_color(value, true)
}

class ParamInt extends Parameter {
    constructor(node, label) {
        super(node, label)
        this.value = 0
    }
}

class ParamVec2 extends Parameter {
    constructor(node, label, start_x, start_y) {
        super(node, label)
        this.x = start_x
        this.y = start_y
    }
    add_elems(parent) {
        let line = add_param_line(parent)
        add_param_label(line, this.label)
        let that = this
        add_param_edit(line, this.x, function(v) { that.x = v })
        add_param_edit(line, this.y, function(v) { that.y = v })
    }
}

class ParamColor extends Parameter {
    constructor(node, label, start_c_str) {
        super(node, label)
        this.v = start_c_str
    }
    add_elems(parent) {
        let line = add_param_line(parent)
        add_param_label(line, this.label)
        let that = this
        add_param_color(line, this.v, function(v) { that.v = v.hex })
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
    }
}
