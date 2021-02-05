import Component from "../Component.js";
import SubShaderSource from "./SubShaderSource.js";
import ShaderProgram from "../WebGL/ShaderProgram.js";

/**
 * 材质定义，材质定义定义了相关物体渲染时的着色材质属性，通过MaterialShaderSource完成对材质的实现。<br/>
 * @author Kkk
 */
export default class Material extends Component{
    getType(){
        return "Material";
    }
    constructor(owner, cfg) {
        super(owner, cfg);
        // 根据当前材质类型获取对应的着色器源码定义，并生成对应的着色器程序
        this._m_MaterialSource = new SubShaderSource(cfg.materialSourceDef);
        // 根据materialShaderSource,创建着色器程序,然后根据材质定义,获取着色器变量
        this._m_ShaderProgram = new ShaderProgram(this._m_Scene.getCanvas().getGLContext(), this._m_MaterialSource.getShaderSource());
        // 变量参数
        this._m_SystemParams = {};
        this._m_Params = {};
        this._init();
    }
    use(){
        let gl = this._m_Scene.getCanvas().getGLContext();
        this._m_ShaderProgram.use(gl);
        if(this._m_SystemParams){
            // 更新系统参数
        }
        if(this._m_Params){
            // 更新参数
            for(let key in this._m_Params){
            }
        }
    }

    /**
     * 使用指定subShader进行材质着色。<br/>
     * @param {SubShader}[subShader]
     */
    use(subShader){
        let gl = this._m_Scene.getCanvas().getGLContext();
        subShader.use(gl);
        // 更新参数到subShader中?
        // modelMatrix,蒙皮骨骼变换这些信息,只能由具体的Geometry去传递,所以应该在Geometry中更新modelMatrix,但由于是提交数据时仅需要local,所以Geometry需要持有mat SubShader,这样才能直到更新到哪个shader句柄中。
        // 而灯光的一些信息,应该由灯光模块系统去执行更新(如果使用ubo block,则可以不需要引用mat就可以独立更新,mat subShader只需要绑定指定的ubo block即可)
        if(this._m_Params){
            // 更新参数
            for(let key in this._m_Params){
            }
        }
    }
    _init(){
        let gl = this._m_Scene.getCanvas().getGLContext();
        this.use();
        let mI = gl.getUniformLocation(this._m_ShaderProgram.getProgram(), "modelMatrix");
        gl.uniformMatrix4fv(mI, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
        let ubi = gl.getUniformBlockIndex(this._m_ShaderProgram.getProgram(), "VP");
        gl.uniformBlockBinding(this._m_ShaderProgram.getProgram(), ubi, 0x001);
        gl.useProgram(null);
    }

}
