<script>

 var Module = {
    preRun: [],
    postRun: [],
    print: function(text) {
        console.log(text);
    },
    printErr: function(text) {
        console.error(text);
    },
    canvas: null,
    setStatus: function(text) {
        // console.log("STATUS:" + text)
    },
    totalDependencies: 0,
    monitorRunDependencies: function(left) {
    },
    onRuntimeInitialized: function() {
        //console.log('zerg');
        start()
    }    
 }  
</script>
<script src="out/geom_nodes.js"></script>