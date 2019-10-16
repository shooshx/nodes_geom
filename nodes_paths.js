class MultiPath extends PObject
{
    static name() { return "MultiPath" }
    constructor() {
        super()
        this.paths = [] // list of paths, each a list os strings 
    }
    add_path(p) {
        this.paths.push(p)
    }

    get_disp_params(disp_values) {
        return [ new DispParamBool(disp_values, "Show Vertices", 'show_vtx', true),
                 new DispParamBool(disp_values, "Show Lines", 'show_lines', true),
                 new DispParamBool(disp_values, "Show Faces", 'show_faces', true)
                ]
    }

    // API
    transform(m) {

    }

    // API
    get_bbox() {
    }

    // API
    draw(m, disp_values) {

    }
}