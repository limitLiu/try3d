import DefaultRenderProgram from "./DefaultRenderProgram.js";
import RenderState from "../../WebGL/RenderState.js";
import DirectionalLight from "../../Light/DirectionalLight.js";
import TempVars from "../../Util/TempVars.js";
import Matrix44 from "../../Math3d/Matrix44.js";
import Log from "../../Util/Log.js";
import ShaderSource from "../../WebGL/ShaderSource.js";
import Vector3 from "../../Math3d/Vector3.js";
import Vector4 from "../../Math3d/Vector4.js";

/**
 * 光照通过多个Pass累计着色，为了性能考虑，这里采用了光锥裁剪进行逐光源Shading。<br/>
 * @author Kkk
 * @date 2021年9月7日13点46分
 * @update 2021年9月7日13点46分
 */
export default class MultiPassIBLLightingRenderProgram extends DefaultRenderProgram{
    static PROGRAM_TYPE = 'MultiPassIBLLighting';
    static S_CUR_LIGHT_COUNT = '_curLightCount';
    static S_AMBIENT_LIGHT_COLOR = '_ambientLightColor';
    static S_BLEND_GI_PROBES = '_blend_gi_probes';
    static S_MULTI_ID_SRC = '_multiId';
    static S_V_LIGHT_DATA = '_vLightData';
    static S_W_LIGHT_DATA = '_wLightData';
    static S_V_LIGHT_DATA0 = '_vLight_Data_0';
    static S_V_LIGHT_DATA1 = '_vLight_Data_1';
    static S_V_LIGHT_DATA2 = '_vLight_Data_2';
    static S_W_LIGHT_DATA0 = '_wLight_Data_0';
    static S_W_LIGHT_DATA1 = '_wLight_Data_1';
    static S_W_LIGHT_DATA2 = '_wLight_Data_2';
    static S_PREF_ENV_MAP_SRC = '_prefEnvMap';
    static S_WGIPROBE_SRC = '_wGIProbe';
    static S_SH_COEFFS_SRC = "_ShCoeffs";

    // 临时变量
    _m_PV = null;
    _m_Temp_Vec3 = new Vector3();
    _m_Temp_Vec4 = new Vector4();
    _m_Temp_Vec4_2 = new Vector4();
    _m_Temp_Vec4_3 = new Vector4();
    _m_Cam_Up = new Vector4();
    _m_Cam_Left = new Vector4();
    _m_Light_Left = new Vector4();
    _m_Light_Up = new Vector4();
    _m_Light_Center = new Vector4();
    _m_ViewPortWidth = -1;
    _m_ViewPortHeight = -1;
    _m_CamLeftCoeff = -1;
    _m_CamTopCoeff = -1;
    constructor(props) {
        super(props);
        this._m_AccumulationLights = new RenderState();
        this._m_AccumulationLights.setFlag(RenderState.S_STATES[4], 'On');
        this._m_AccumulationLights.setFlag(RenderState.S_STATES[1], 'Off');
        // 使用SRC_ALPHA，ONE的原因在于，第一个pass总是dir或ambient
        this._m_AccumulationLights.setFlag(RenderState.S_STATES[5], ['SRC_ALPHA', 'ONE']);
        this._m_ClipLights = new RenderState();
        this._m_ClipLights.setFlag(RenderState.S_STATES[6], 'On');
        this._m_m_LastSubShader = null;
    }
    reset(){
        this._m_m_LastSubShader = null;
    }

    /**
     * 混合GI探头信息。<br/>
     * 暂时仅仅只是提交单个探头信息。<br/>
     * @param {WebGL}[gl]
     * @param {Scene}[scene]
     * @param {FrameContext}[frameContext]
     * @private
     */
    _blendGIProbes(gl, scene, frameContext){
        let conVars = frameContext.m_LastSubShader.getContextVars();
        // 探头信息
        let probeLoc = null;
        if(conVars[MultiPassIBLLightingRenderProgram.S_WGIPROBE_SRC] != null){
            if(this._m_m_LastSubShader != frameContext.m_LastSubShader){
                // 提取相交的探头
                // 并更新探头数据进行混合渲染(但这里未实现,先记录下)
                // Log.log('提交探头!');
                let giProbe = scene.getGIProbes()[0];
                let giData = TempVars.S_TEMP_VEC4;
                // 探头位置
                giData.setToInXYZW(giProbe.getPosition()._m_X, giProbe.getPosition()._m_Y, giProbe.getPosition()._m_Z, 1.0 / giProbe.getRadius() + giProbe.getPrefilterMipmap());
                gl.uniform4fv(conVars[MultiPassIBLLightingRenderProgram.S_WGIPROBE_SRC].loc, giData.getBufferData(), 0, 4);
                // 球谐系数
                giData = giProbe.getShCoeffsBufferData();
                if(conVars[MultiPassIBLLightingRenderProgram.S_SH_COEFFS_SRC] != null)
                    gl.uniform3fv(conVars[MultiPassIBLLightingRenderProgram.S_SH_COEFFS_SRC].loc, giData.getBufferData(), 0, 9 * 3);
                // prefilterEnvMap
                if(conVars[MultiPassIBLLightingRenderProgram.S_PREF_ENV_MAP_SRC] != null)
                    giProbe.getPrefilterEnvMap()._upload(gl, conVars[MultiPassIBLLightingRenderProgram.S_PREF_ENV_MAP_SRC].loc);
                this._m_m_LastSubShader = frameContext.m_LastSubShader;
            }
            else{
                // 说明提交过探头数据
                // 这里,检测已经提交的探头数据,然后分析是否与之相交,否则关闭探头数据,避免错误的渲染和额外的渲染
            }
        }
        else{
            // 检测探头
            let giProbes = scene.getGIProbes();
            if(giProbes && giProbes.length > 0){
                // 找出与之相交的探头
                // 首次,更新材质定义
                frameContext.m_LastMaterial.addDefine(ShaderSource.S_GIPROBES_SRC, true);
            }
        }
    }
    /**
     * 光锥裁剪。<br/>
     * @param {GLContext}[gl]
     * @param {Light}[light 只能是PointLight或SpotLight]
     * @param {Boolean}[lightCvvTest true进行光锥裁剪测试]
     * @return {Boolean}[如果被剔除,则返回false]
     */
    _lightClip(gl, light, lightCvvTest){
        let bounding = light.getBoundingVolume();
        let r = bounding.getRadius();
        let lr = r * this._m_CamLeftCoeff;
        let tr = r * this._m_CamTopCoeff;
        let center = bounding.getCenter(this._m_Temp_Vec3);
        center = this._m_Temp_Vec4.setToInXYZW(center._m_X, center._m_Y, center._m_Z, 1.0);
        this._m_Temp_Vec4._m_W = 1.0;
        this._m_Temp_Vec4_2._m_W = 1.0;
        this._m_Temp_Vec4_3._m_W = 1.0;

        // 与其进行测试，不如直接进行光源裁剪，因为测试会增加cpu变换矩阵的次数
        // let lightFrustumLeftTop = this._m_LightCvv_LeftTop.multLength(r, this._m_Temp_Vec4_2).add(center);
        // let lightFrustumRightBtm = this._m_LightCvv_RightBottom.multLength(r, this._m_Temp_Vec4_3).add(center);
        // Matrix44.multiplyMV(this._m_Light_LeftTop, lightFrustumLeftTop, this._m_PV);
        // Matrix44.multiplyMV(this._m_Light_RightBottom, lightFrustumRightBtm, this._m_PV);
        // if(!lightCvvTest || !this._lightCvvTest(this._m_Light_LeftTop._m_X, this._m_Light_LeftTop._m_Y, this._m_Light_LeftTop._m_W, this._m_Light_RightBottom._m_X, this._m_Light_RightBottom._m_Y, this._m_Light_RightBottom._m_W)){
        //
        //     this._m_Light_LeftTop._m_X /= this._m_Light_LeftTop._m_W;
        //     this._m_Light_LeftTop._m_Y /= this._m_Light_LeftTop._m_W;
        //     this._m_Light_RightBottom._m_X /= this._m_Light_RightBottom._m_W;
        //     this._m_Light_RightBottom._m_Y /= this._m_Light_RightBottom._m_W;
        //     this._m_Light_LeftTop._m_X = this._m_ViewPortWidth * (1.0 + this._m_Light_LeftTop._m_X);
        //     this._m_Light_RightBottom._m_X = this._m_ViewPortWidth * (1.0 + this._m_Light_RightBottom._m_X);
        //     this._m_Light_LeftTop._m_Y = this._m_ViewPortHeight * (1.0 - this._m_Light_LeftTop._m_Y);
        //     this._m_Light_RightBottom._m_Y = this._m_ViewPortHeight * (1.0 - this._m_Light_RightBottom._m_Y);
        //
        //     // 计算光锥裁剪区
        //     let lw = this._m_Light_RightBottom._m_X - this._m_Light_LeftTop._m_X;
        //     let lh = this._m_Light_RightBottom._m_Y - this._m_Light_LeftTop._m_Y;
        //
        //     gl.scissor(this._m_Light_LeftTop._m_X, this._m_ViewPortHeight * 2.0 - this._m_Light_RightBottom._m_Y, lw, lh);
        //     return true;
        // }
        let lightFrustumLeft = this._m_Cam_Left.multLength(lr, this._m_Temp_Vec4_2).add(center);
        let lightFrustumUp = this._m_Cam_Up.multLength(tr, this._m_Temp_Vec4_3).add(center);
        Matrix44.multiplyMV(this._m_Light_Left, lightFrustumLeft, this._m_PV);
        Matrix44.multiplyMV(this._m_Light_Up, lightFrustumUp, this._m_PV);
        Matrix44.multiplyMV(this._m_Light_Center, center, this._m_PV);
        this._m_Light_Left._m_X /= this._m_Light_Left._m_W;
        this._m_Light_Left._m_Y /= this._m_Light_Left._m_W;
        this._m_Light_Up._m_X /= this._m_Light_Up._m_W;
        this._m_Light_Up._m_Y /= this._m_Light_Up._m_W;
        this._m_Light_Center._m_X /= this._m_Light_Center._m_W;
        this._m_Light_Center._m_Y /= this._m_Light_Center._m_W;
        this._m_Light_Left._m_X = this._m_ViewPortWidth * (1.0 + this._m_Light_Left._m_X);
        this._m_Light_Up._m_X = this._m_ViewPortWidth * (1.0 + this._m_Light_Up._m_X);
        this._m_Light_Center._m_X = this._m_ViewPortWidth * (1.0 + this._m_Light_Center._m_X);
        this._m_Light_Left._m_Y = this._m_ViewPortHeight * (1.0 - this._m_Light_Left._m_Y);
        this._m_Light_Up._m_Y = this._m_ViewPortHeight * (1.0 - this._m_Light_Up._m_Y);
        this._m_Light_Center._m_Y = this._m_ViewPortHeight * (1.0 - this._m_Light_Center._m_Y);
        // 计算光锥裁剪区
        // 视口映射后原点在左上角
        let lw = Math.abs(this._m_Light_Left._m_X - this._m_Light_Center._m_X);
        let lh = Math.abs(this._m_Light_Center._m_Y - this._m_Light_Up._m_Y);
        let left = -1, btm = -1;
        if(this._m_Light_Center._m_Z < -this._m_Light_Center._m_W){
            left = -this._m_Light_Center._m_X - lw;
            btm = -this._m_Light_Center._m_Y + lh;
        }
        else{
            left = this._m_Light_Center._m_X - lw;
            btm = this._m_Light_Center._m_Y + lh;
        }
        gl.scissor(left, this._m_ViewPortHeight * 2.0 - btm, lw * 2, lh * 2);
        return true;
    }

    /**
     *
     * @param gl
     * @param scene
     * @param {FrameContext}[frameContext]
     * @param lights
     * @param batchSize
     * @param lastIndex
     * @param lightIndex
     * @param passId
     * @param blendGiProbes
     * @private
     */
    _uploadLights(gl, scene, frameContext, lights, batchSize, lastIndex, lightIndex, passId, blendGiProbes){
        let conVars = frameContext.m_LastSubShader.getContextVars();
        let enableGI = scene.enableGIProbes();
        if(conVars[MultiPassIBLLightingRenderProgram.S_MULTI_ID_SRC] != undefined){
            gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_MULTI_ID_SRC].loc, passId);
        }
        if(conVars[MultiPassIBLLightingRenderProgram.S_BLEND_GI_PROBES] != undefined){
            gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_BLEND_GI_PROBES].loc, blendGiProbes && enableGI);
        }
        if(passId == 0){
            if(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR] != null){
                if(lastIndex == 0){
                    // 提交合计的ambientColor(场景可能添加多个ambientLight)
                    // 也可以设计为场景只能存在一个ambientColor
                    let ambientLightColor = scene.AmbientLightColor;
                    gl.uniform3f(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR].loc, ambientLightColor._m_X, ambientLightColor._m_Y, ambientLightColor._m_Z);
                }
                else{
                    // 开启累积缓存模式
                    // 我们使用result = s * 1.0 + d * 1.0
                    // 所以,渲染当前pass,s部分在当前混合下应该使用一个全黑的ambientLightColor(因为第一个pass已经计算了ambientLightColor)
                    gl.uniform3f(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR].loc, 0.0, 0.0, 0.0);
                    scene.getRender()._checkRenderState(gl, this._m_AccumulationLights, frameContext.getRenderState());
                }
            }
            // 探头信息
            if(enableGI)
                this._blendGIProbes(gl, scene, frameContext);


            // 灯光信息
            let lightSpaceLoc = null;
            let lightSpace = null;
            if(conVars[MultiPassIBLLightingRenderProgram.S_V_LIGHT_DATA] != null){
                lightSpace = 1;
                lightSpaceLoc = conVars[MultiPassIBLLightingRenderProgram.S_V_LIGHT_DATA].loc;
            }
            else if(conVars[MultiPassIBLLightingRenderProgram.S_W_LIGHT_DATA] != null){
                lightSpace = 0;
                lightSpaceLoc = conVars[MultiPassIBLLightingRenderProgram.S_W_LIGHT_DATA].loc;
            }
            // 计算实际需要上载的灯光
            let curLightCount = (batchSize + lastIndex) > lights.length ? (lights.length - lastIndex) : batchSize;
            if(lightSpaceLoc == null){
                return curLightCount + lastIndex;
            }
            let light = null;
            let lightColor = null;
            // 灯光数据
            let lightData = TempVars.S_LIGHT_DATA_4;
            let array = lightData.getArray();
            let tempVec4 = TempVars.S_TEMP_VEC4;
            let tempVec42 = TempVars.S_TEMP_VEC4_2;
            // 上载灯光信息
            // 数据编码格式内容
            // 第一个元素保存光照颜色,w分量保存光照类型(0DirectionalLight,1PointLight,2SpotLight)
            for(let i = lastIndex,offset = 0,end = curLightCount + lastIndex;i < end;i++,offset+=12){
                light = lights[i];
                lightColor = light.getColor();
                array[offset] = lightColor._m_X;
                array[offset + 1] = lightColor._m_Y;
                array[offset + 2] = lightColor._m_Z;
                array[offset + 3] = light.getTypeId();
                switch (light.getType()) {
                    case 'DirectionalLight':
                        // 提交灯光方向
                        if(lightSpace){
                            // 在视图空间计算光源,避免在片段着色阶段计算viewDir
                            tempVec42.setToInXYZW(light.getDirection()._m_X, light.getDirection()._m_Y, light.getDirection()._m_Z, 0);
                            Matrix44.multiplyMV(tempVec4, tempVec42, scene.getMainCamera().getViewMatrix());
                            array[offset + 4] = tempVec4._m_X;
                            array[offset + 5] = tempVec4._m_Y;
                            array[offset + 6] = tempVec4._m_Z;
                            array[offset + 7] = -1;
                        }
                        else{
                            // 在世界空间计算光源
                            array[offset + 4] = light.getDirection()._m_X;
                            array[offset + 5] = light.getDirection()._m_Y;
                            array[offset + 6] = light.getDirection()._m_Z;
                            array[offset + 7] = -1;
                        }
                        // 第三个数据占位(不要假设默认为0,因为重复使用这个缓存,所以最好主动填充0)
                        array[offset + 8] = 0;
                        array[offset + 9] = 0;
                        array[offset + 10] = 0;
                        array[offset + 11] = 0;
                        break;
                }
            }
            // 上载数据
            // gl[conVars[MultiPassIBLLightingRenderProgram.S_LIGHT_DATA].fun]
            gl.uniform4fv(lightSpaceLoc, lightData.getBufferData(), 0, curLightCount * 12);
            if(conVars[MultiPassIBLLightingRenderProgram.S_CUR_LIGHT_COUNT] != null)
                gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_CUR_LIGHT_COUNT].loc, curLightCount * 3);
            return curLightCount + lastIndex;
        }
        else if(passId == 1){
            let light = null;
            let lightColor = null;
            light = lights[lightIndex];
            // 对于第一个pass我们不需要进行光锥裁剪
            if(lastIndex > 0){
                // 这里，另外一种光源裁剪方式是通过等效BoundingVolume来作为PointLight和SpotLight的Geometry进行一次绘制调用
                // 或者，使用模板缓存测试来完成光源裁剪
                if(!this._lightClip(gl, light, true)){
                    // 如果lastIndex<=0,表示lightIndex为0或至今还没有一个光源被着色，则返回-1，以便至少一个光源执行ambientColor pass
                    return lastIndex <= 0 ? -1 : 0;
                }
            }
            if(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR] != null){
                if(lastIndex <= 0){
                    // 提交合计的ambientColor(场景可能添加多个ambientLight)
                    // 也可以设计为场景只能存在一个ambientColor
                    let ambientLightColor = scene.AmbientLightColor;
                    gl.uniform3f(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR].loc, ambientLightColor._m_X, ambientLightColor._m_Y, ambientLightColor._m_Z);
                }
                else{
                    // 开启累积缓存模式
                    // 我们使用result = s * 1.0 + d * 1.0
                    // 所以,渲染当前pass,s部分在当前混合下应该使用一个全黑的ambientLightColor(因为第一个pass已经计算了ambientLightColor)
                    gl.uniform3f(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR].loc, 0.0, 0.0, 0.0);
                    scene.getRender()._checkRenderState(gl, this._m_AccumulationLights, frameContext.getRenderState());
                }
            }
            // 探头信息
            if(enableGI)
                this._blendGIProbes(gl, scene, frameContext);

            let lightSpaceLoc = null;
            let lightSpaceLoc1 = null;
            let lightSpaceLoc2 = null;
            let lightSpace = null;
            let tempVec4 = TempVars.S_TEMP_VEC4;
            let tempVec42 = TempVars.S_TEMP_VEC4_2;
            let tempVec43 = TempVars.S_TEMP_VEC4_3;
            if(conVars[MultiPassIBLLightingRenderProgram.S_V_LIGHT_DATA0] != undefined){
                lightSpace = 1;
                lightSpaceLoc = conVars[MultiPassIBLLightingRenderProgram.S_V_LIGHT_DATA0].loc;
                lightSpaceLoc1 = conVars[MultiPassIBLLightingRenderProgram.S_V_LIGHT_DATA1].loc;
                lightSpaceLoc2 = conVars[MultiPassIBLLightingRenderProgram.S_V_LIGHT_DATA2].loc;
            }
            else if(conVars[MultiPassIBLLightingRenderProgram.S_W_LIGHT_DATA0] != undefined){
                lightSpace = 0;
                lightSpaceLoc = conVars[MultiPassIBLLightingRenderProgram.S_W_LIGHT_DATA0].loc;
                lightSpaceLoc1 = conVars[MultiPassIBLLightingRenderProgram.S_W_LIGHT_DATA1].loc;
                lightSpaceLoc2 = conVars[MultiPassIBLLightingRenderProgram.S_W_LIGHT_DATA2].loc;
            }
            if(lightSpace == null)return 1;
            lightColor = light.getColor();
            tempVec4.setToInXYZW(lightColor._m_X, lightColor._m_Y, lightColor._m_Z, light.getTypeId());
            switch (light.getType()) {
                case 'PointLight':
                    if(lightSpace){
                        // view空间
                    }
                    else{
                        // 世界空间
                        tempVec42.setToInXYZW(light.getPosition()._m_X, light.getPosition()._m_Y, light.getPosition()._m_Z, light.getInRadius());
                    }
                    // 第三个数据占位(不要假设默认为0,因为重复使用这个缓存,所以最好主动填充0)
                    tempVec43.setToInXYZW(0, 0, 0, 0);
                    break;
                case 'SpotLight':
                    if(lightSpace){

                    }
                    else{
                        // 世界空间
                        tempVec42.setToInXYZW(light.getPosition()._m_X, light.getPosition()._m_Y, light.getPosition()._m_Z, light.getInvSpotRange());
                    }
                    // 提交spotDir其他信息
                    tempVec43.setToInXYZW(light.getDirection()._m_X, light.getDirection()._m_Y, light.getDirection()._m_Z, light.getPackedAngleCos());
                    break;
            }
            if(lightSpaceLoc != null){
                gl.uniform4f(lightSpaceLoc, tempVec4._m_X, tempVec4._m_Y, tempVec4._m_Z, tempVec4._m_W);
            }
            if(lightSpaceLoc1 != null){
                gl.uniform4f(lightSpaceLoc1, tempVec42._m_X, tempVec42._m_Y, tempVec42._m_Z, tempVec42._m_W);
            }
            if(lightSpaceLoc2 != null){
                gl.uniform4f(lightSpaceLoc2, tempVec43._m_X, tempVec43._m_Y, tempVec43._m_Z, tempVec43._m_W);
            }
            // 返回1表示渲染当前场景
            return 1;
        }
        return 0;
    }
    draw(gl, scene, frameContext, iDrawable, lights) {

        // 如果灯光数量为0,则直接执行渲染
        if(lights.length == 0){
            let conVars = frameContext.m_LastSubShader.getContextVars();
            let enableGI = scene.enableGIProbes();
            if(enableGI)
                this._blendGIProbes(gl, scene, frameContext);
            if(conVars[MultiPassIBLLightingRenderProgram.S_BLEND_GI_PROBES] != undefined){
                gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_BLEND_GI_PROBES].loc, enableGI);
            }
            if(conVars[MultiPassIBLLightingRenderProgram.S_MULTI_ID_SRC] != null)
                gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_MULTI_ID_SRC].loc, 0);
            if(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR] != null){
                let ambientLightColor = scene.AmbientLightColor;
                gl.uniform3f(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR].loc, ambientLightColor._m_X, ambientLightColor._m_Y, ambientLightColor._m_Z);
            }
            if(conVars[MultiPassIBLLightingRenderProgram.S_CUR_LIGHT_COUNT] != null)
                gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_CUR_LIGHT_COUNT].loc, 0);
            iDrawable.draw(frameContext);
            return;
        }
        // 计算灯光是否处于iDrawable可见范围

        // 批量提交灯光
        // 应该根据引擎获取每次提交的灯光批次数量
        // 但是每个批次不应该超过4
        let batchSize = scene.getRender().getBatchLightSize();
        frameContext.getRenderState().store();
        // 首先将dir light部分取出来
        let dirLights = [];
        let otherLights = [];
        let type = null;
        lights.forEach(light=>{
            type = light.getType();
            if(type == 'DirectionalLight'){
                dirLights.push(light);
            }
            else if(type == 'PointLight' || type == 'SpotLight'){
                otherLights.push(light);
            }
        });
        // 在第一个pass中渲染dirLights
        let lastIndex = 0;
        while(lastIndex < dirLights.length){
            // 更新灯光信息
            lastIndex = this._uploadLights(gl, scene, frameContext, dirLights, batchSize, lastIndex, -1, 0, lastIndex == 0);
            // 最后draw
            iDrawable.draw(frameContext);
        }
        // 在第二个pass中渲染otherLights
        let index = 0;
        if(otherLights.length > 0){
            scene.getRender()._checkRenderState(gl, this._m_ClipLights, frameContext.getRenderState());
            this._m_ViewPortWidth = scene.getMainCamera().getWidth() * 0.5;
            this._m_ViewPortHeight = scene.getMainCamera().getHeight() * 0.5;
            gl.scissor(0, 0, this._m_ViewPortWidth * 2, this._m_ViewPortHeight * 2);
            this._m_PV = scene.getMainCamera().getProjectViewMatrix(true);
            let v = scene.getMainCamera().getViewMatrix();
            this._m_Temp_Vec3.setToInXYZ(v.m[0], v.m[4], v.m[8]);
            this._m_CamLeftCoeff = 1.0 / scene.getMainCamera().getFrustumPlane(1).getNormal().dot(this._m_Temp_Vec3);
            this._m_Temp_Vec3.setToInXYZ(v.m[1], v.m[5], v.m[9]);
            this._m_CamTopCoeff = 1.0 / scene.getMainCamera().getFrustumPlane(2).getNormal().dot(this._m_Temp_Vec3);
            this._m_Cam_Left.setToInXYZW(v.m[0], v.m[4], v.m[8], 1.0).multLength(-1);
            this._m_Cam_Up.setToInXYZW(v.m[1], v.m[5], v.m[9], 1.0);
        }
        while(index < otherLights.length){
            // 更新灯光信息
            lastIndex = this._uploadLights(gl, scene, frameContext, otherLights, batchSize, lastIndex != 0 ? lastIndex : index, index, 1, lastIndex == 0 && index == 0);
            index++;
            // 最后draw
            if(lastIndex == 1){
                iDrawable.draw(frameContext);
            }
        }
        scene.getRender()._checkRenderState(gl, frameContext.getRenderState().restore(), frameContext.getRenderState());
        frameContext.BatchLightLastIndex = lastIndex;
    }
    drawArrays(gl, scene, frameContext, iDrawables, lights){
        // 如果灯光数量为0,则直接执行渲染
        if(lights.length == 0){
            let conVars = frameContext.m_LastSubShader.getContextVars();
            let enableGI = scene.enableGIProbes();
            if(enableGI)
                this._blendGIProbes(gl, scene, frameContext);
            if(conVars[MultiPassIBLLightingRenderProgram.S_BLEND_GI_PROBES] != undefined){
                gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_BLEND_GI_PROBES].loc, enableGI);
            }
            if(conVars[MultiPassIBLLightingRenderProgram.S_MULTI_ID_SRC] != null)
                gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_MULTI_ID_SRC].loc, 0);
            if(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR] != null){
                let ambientLightColor = scene.AmbientLightColor;
                gl.uniform3f(conVars[MultiPassIBLLightingRenderProgram.S_AMBIENT_LIGHT_COLOR].loc, ambientLightColor._m_X, ambientLightColor._m_Y, ambientLightColor._m_Z);
            }
            if(conVars[MultiPassIBLLightingRenderProgram.S_CUR_LIGHT_COUNT] != null)
                gl.uniform1i(conVars[MultiPassIBLLightingRenderProgram.S_CUR_LIGHT_COUNT].loc, 0);
            iDrawables.forEach(iDrawable=>{
                iDrawable.draw(frameContext);
            });
            return;
        }
        // 计算灯光是否处于iDrawable可见范围

        // 批量提交灯光
        // 应该根据引擎获取每次提交的灯光批次数量
        // 但是每个批次不应该超过4
        let batchSize = scene.getRender().getBatchLightSize();
        frameContext.getRenderState().store();
        // 首先将dir light部分取出来
        let dirLights = [];
        let otherLights = [];
        let type = null;
        lights.forEach(light=>{
            type = light.getType();
            if(type == 'DirectionalLight'){
                dirLights.push(light);
            }
            else if(type == 'PointLight' || type == 'SpotLight'){
                otherLights.push(light);
            }
        });
        // 在第一个pass中渲染dirLights
        let lastIndex = 0;
        while(lastIndex < dirLights.length){
            // 更新灯光信息
            lastIndex = this._uploadLights(gl, scene, frameContext, dirLights, batchSize, lastIndex, -1, 0, lastIndex == 0);
            // 最后draw
            iDrawable.draw(frameContext);
        }
        // 在第二个pass中渲染otherLights
        let index = 0;
        if(otherLights.length > 0){
            scene.getRender()._checkRenderState(gl, this._m_ClipLights, frameContext.getRenderState());
            this._m_ViewPortWidth = scene.getMainCamera().getWidth() * 0.5;
            this._m_ViewPortHeight = scene.getMainCamera().getHeight() * 0.5;
            gl.scissor(0, 0, this._m_ViewPortWidth * 2, this._m_ViewPortHeight * 2);
            this._m_PV = scene.getMainCamera().getProjectViewMatrix(true);
            let v = scene.getMainCamera().getViewMatrix();
            this._m_Temp_Vec3.setToInXYZ(v.m[0], v.m[4], v.m[8]);
            this._m_CamLeftCoeff = 1.0 / scene.getMainCamera().getFrustumPlane(1).getNormal().dot(this._m_Temp_Vec3);
            this._m_Temp_Vec3.setToInXYZ(v.m[1], v.m[5], v.m[9]);
            this._m_CamTopCoeff = 1.0 / scene.getMainCamera().getFrustumPlane(2).getNormal().dot(this._m_Temp_Vec3);
            this._m_Cam_Left.setToInXYZW(v.m[0], v.m[4], v.m[8], 1.0).multLength(-1);
            this._m_Cam_Up.setToInXYZW(v.m[1], v.m[5], v.m[9], 1.0);
        }
        while(index < otherLights.length){
            // 更新灯光信息
            lastIndex = this._uploadLights(gl, scene, frameContext, otherLights, batchSize, lastIndex != 0 ? lastIndex : index, index, 1, lastIndex == 0 && index == 0);
            index++;
            // 最后draw
            if(lastIndex == 1){
                iDrawables.forEach(iDrawable=>{
                    iDrawable.draw(frameContext);
                });
            }
        }
        scene.getRender()._checkRenderState(gl, frameContext.getRenderState().restore(), frameContext.getRenderState());
        frameContext.BatchLightLastIndex = lastIndex;

    }

}
