import Component from "../Component.js";
import AssetLoader from "../Util/AssetLoader.js";
import ShaderSource from "../WebGL/ShaderSource.js";
import Tools from "../Util/Tools.js";
import SubShaderDef from "./SubShaderDef.js";

class Block{
    /**
     * 块数据包含。
     * @param {String}[type 块类型]
     * @param {String}[id 块id]
     * @param {String[]}[data 字符串串数组]
     * @param {Number}[start 块开始索引]
     * @param {Number}[end 块结束索引]
     */
    constructor(type, id, data, start, end) {
        this.m_Type = type;
        this.m_Id = id;
        this.m_Data = data;
        this.m_Start = start;
        this.m_End = end;
        this.m_SubBlock = [];
    }
    getName(){
        return this.m_Id;
    }
    getType(){
        return this.m_Type;
    }
    addSubBlock(subBlock){
        this.m_SubBlock.push(subBlock);
    }
    getSubBlock(){
        return this.m_SubBlock;
    }
    setStart(start){
        this.m_Start = start;
    }
    getStart(){
        return this.m_Start;
    }
    setEnd(end){
        this.m_End = end;
    }
    getEnd(){
        return this.m_End;
    }
    getData(){
        return this.m_Data;
    }
    toString(){
        return "type:" + this.m_Type + "\n" + "" +
            "id:" + this.m_Id + "\n" +
            "data:\n" + this.m_Data + "\n";
    }

}
class Param{
    constructor() {
        this.m_Name = null;
        this.m_Type = null;
        this.m_DefaultValue = null;

        this.m_Pattern = null;
        this.m_TagPattern = null;
        this.m_DefType = null;
    }
    creator(){
        this.m_Pattern = eval("/Params." + this.m_Name + "/");
        this.m_TagPattern = eval("/Params." + this.m_Name + "/g");
        this.m_DefType = "" + this.m_Name;
    }
    getDefType(){
        return this.m_DefType;
    }
    getPattern(){
        return this.m_Pattern;
    }
    getTagPattern(){
        return this.m_TagPattern;
    }
    setName(name){
        this.m_Name = name;
    }
    getName(){
        return this.m_Name;
    }
    setType(type){
        this.m_Type = type;
    }
    getType(){
        return this.m_Type;
    }
    setDefaultValue(defaultValue){
        this.m_DefaultValue = defaultValue;
    }
    getDefaultVaule(){
        return this.m_DefaultValue;
    }

}
class SubTechnology{
    constructor() {
        this.m_Name = null;
        this.m_Shaders = {};
    }
    setName(name){
        this.m_Name = name;
    }
    getName(){
        return this.m_Name;
    }
    addShader(type, shader){
        this.m_Shaders[type] = shader;
    }
    getShaders(){
        return this.m_Shaders;
    }

}
/**
 * 材质定义。
 */
export default class MaterialDef{
    constructor() {
        // 解析
        // 材质名称
        this._m_Name = "";
        // 材质参数(元素类型Param)
        this._m_Params = {};
        // subShaderDefs
        this._m_SubShaderDefs = {};
    }
    addSubShaderDef(name, subShaderDef){
        this._m_SubShaderDefs[name] = subShaderDef;
        subShaderDef.setFromMaterialDef(this);
    }
    getSubShaderDef(name){
        return this._m_SubShaderDefs[name];
    }
    getSubShaderDefs(){
        return this._m_SubShaderDefs;
    }
    addParam(param){
        this._m_Params[param.getName()] = param;
    }
    getParams(){
        return this._m_Params;
    }
    setName(name){
        this._m_Name = name;
    }
    static load(src){
        return MaterialDef.parse(AssetLoader.loadMaterialSourceDef(src));
    }
    static trim(str){
        return str.replace(/(^\s*)|(\s*$)/g, "");
    }

    /**
     * 解析材质参数块。<br/>
     * @param {MaterialDef}[matDef 结果材质定义]
     * @param {Block}[blockDef 定义块]
     */
    static parseParams(matDef, blockDef){
        // 解析材质参数
        let data = blockDef.getData();
        let line = null;
        let param = null;
        for(let i = blockDef.getStart() + 1;i < blockDef.getEnd();i++){
            line = data[i];
            // 按空格分割(去掉最后的;号)
            line = Tools.trim(line);
            line = line.substring(0, line.length - 1).split(" ");
            param = new Param();
            param.setName(line[1]);
            param.setType(line[0]);
            param.creator();
            if(line.length > 2){
                // 默认值
                param.setDefaultValue(line[3]);
            }
            matDef.addParam(param);
        }
    }

    /**
     * 解析SubTechnology。<br/>
     * @param {SubShaderDef}[subShaderDef 结果材质定义]
     * @param {Block}[blockDef 定义块]
     */
    static parseSubTechnology(subShaderDef, blockDef){
        // 解析SubTechnology的vars部分
        let data = blockDef.data;
        let line = null;
        // blockDef.getSubBlock().forEach(subBlockDef=>{
        //     MaterialDef.parseBlockDef(subShaderDef, subBlockDef);
        // });
    }
    static parseShader(subShaderDef, blockDef){
        // 检测vsShader的所有块定义
        blockDef.getSubBlock().forEach(subBlock=>{
            // 解析子块
            MaterialDef.parseBlockDef(subShaderDef, subBlock);
        });
    }
    static parseShaderVars(subShaderDef, blockDef){
        let data = blockDef.getData();
        let line = null;
        for(let i = blockDef.getStart() + 1;i < blockDef.getEnd();i++) {
            line = data[i];
            line = Tools.trim(line);
            line = line.substring(0, line.length - 1);
            line = line.split(" ");
            subShaderDef.addVar(line[0], line[1]);
        }
    }
    static parseVsShaderMain(subShaderDef, blockDef){
        let data = blockDef.getData();
        let line = null;
        let shader = "void main(){\n";
        let useContexts = [];
        let useVars = [];
        let varTable = subShaderDef.getVarTable();
        let params = subShaderDef.getFromMaterialDef().getParams();
        let param = null;
        let useParam = false;
        for(let i = blockDef.getStart() + 1;i < blockDef.getEnd();i++){
            line = data[i];
            // 检测变量列表
            varTable.forEach(vars=>{
                if(Tools.find(line, vars.pattern)){
                    useVars.push(vars);
                }
            });
            // 检测材质参数列表
            for(let k in params){
                param = params[k];
                if(Tools.find(line, param.getPattern())){
                    // 记录使用的材质参数
                    // ...
                    // 设置材质参数
                    line = Tools.repSrc(line, param.getPattern(), param.getTagPattern(), param.getName());
                    useParam = true;
                }
            }
            // 检测上下文列表
            let context = null;
            for(let k in ShaderSource.Context_Data){
                context = ShaderSource.Context_Data[k];
                if(Tools.find(line, context.pattern)){
                    // 记录该vsShader使用的context
                    useContexts.push(context);
                    // 替换指定上下文
                    line = Tools.repSrc(line, context.pattern, context.tagPattern, context.tag);
                }
            }
            shader += Tools.trim(line) + '\n';
        }
        shader += "}\n";
        // 添加材质参数
        if(useParam){
            let inParams = "\n";
            for(let k in params){
                param = params[k];
                // 添加参数
                inParams += "#ifdef " + param.getDefType() + "\n";
                inParams += param.getType() + " " + param.getName() + "\n";
                inParams += "#endif\n";
            }
            shader = inParams + shader;
        }
        // 检测shader是否需要添加变量
        if(useVars.length > 0){
            // 加入变量块
            let outVars = "\n";
            useVars.forEach(vars=>{
                outVars += "out " + vars.type + " " + vars.name + ";\n";
            });
            shader = outVars + shader;
        }
        // 检查context是否包含需要的几何属性
        if(useContexts.length > 0){
            let vertIn = "\n";
            useContexts.forEach(context=>{
                if(context.loc){
                    vertIn += "layout (location=" + context.loc + ") in " + context.type + " " + context.src + ";\n";
                }
                else if(context.type){
                    vertIn += context.type + " " + context.src + ";\n";
                }
            });
            shader = vertIn + shader;
        }

        shader = '#version 300 es\n' +
            shader;

        // 添加shader
        subShaderDef.addShaderSource(ShaderSource.VERTEX_SHADER, shader);
        // 这里,需要在subShader中记录需要更新数据的uniform变量的loc,以及uniform blocks等.以便在真正创建Material对象时,保证渲染时可以根据实际不同的MatDef提交数据到shader中。
        // 在创建Material时,还需要统计整个引擎需要计算哪些上下文变量(比如ViewMatrix,ProjectMatrix...),这样可以避免不必要的变量计算,同时保证所有shader可以正常运行。
        // 每次创建一个Material时,都通过解析subShader来统计待计算的上下文变量。
    }
    static parseFsShaderMain(subShaderDef, blockDef){
        let data = blockDef.getData();
        let line = null;
        let shader = "void main(){\n";
        let useContexts = [];
        let useVars = [];
        let varTable = subShaderDef.getVarTable();
        let params = subShaderDef.getFromMaterialDef().getParams();
        let param = null;
        let useParam = false;
        for(let i = blockDef.getStart() + 1;i < blockDef.getEnd();i++){
            line = data[i];
            // 检测变量列表
            varTable.forEach(vars=>{
                if(Tools.find(line, vars.pattern)){
                    useVars.push(vars);
                }
            });
            // 检测材质参数列表
            for(let k in params){
                param = params[k];
                if(Tools.find(line, param.getPattern())){
                    // 记录使用的材质参数
                    // ...
                    // 设置材质参数
                    line = Tools.repSrc(line, param.getPattern(), param.getTagPattern(), param.getName());
                    useParam = true;
                }
            }
            // 检测上下文列表
            let context = null;
            for(let k in ShaderSource.Context_Data){
                context = ShaderSource.Context_Data[k];
                if(Tools.find(line, context.pattern)){
                    // 记录该vsShader实用的context
                    useContexts.push(context);
                    // 替换指定上下文
                    line = Tools.repSrc(line, context.pattern, context.tagPattern, context.tag);
                }
            }
            shader += Tools.trim(line) + '\n';
        }
        shader += "}\n";
        // 添加材质参数
        if(useParam){
            let inParams = "\n";
            for(let k in params){
                param = params[k];
                // 添加参数
                inParams += "#ifdef " + param.getDefType() + "\n";
                inParams += param.getType() + " " + param.getName() + "\n";
                inParams += "#endif\n";
            }
            shader = inParams + shader;
        }
        // 检测shader是否需要添加变量
        if(useVars.length > 0){
            // 加入变量块
            let inVars = "\n";
            useVars.forEach(vars=>{
                inVars += "in " + vars.type + " " + vars.name + ";\n";
            });
            shader = inVars + shader;
        }
        // 检查context是否包含需要的几何属性
        if(useContexts.length > 0){
            let vertIn = "\n";
            useContexts.forEach(context=>{
                vertIn += context.type + " " + context.src + ";\n";
            });
            shader = vertIn + shader;
        }

        shader = '#version 300 es\n' +
            'precision mediump float;\n' +
            shader;

        // 添加shader
        subShaderDef.addShaderSource(ShaderSource.FRAGMENT_SHADER, shader);
        // 这里,需要在subShader中记录需要更新数据的uniform变量的loc,以及uniform blocks等.以便在真正创建Material对象时,保证渲染时可以根据实际不同的MatDef提交数据到shader中。
        // 在创建Material时,还需要统计整个引擎需要计算哪些上下文变量(比如ViewMatrix,ProjectMatrix...),这样可以避免不必要的变量计算,同时保证所有shader可以正常运行。
        // 每次创建一个Material时,都通过解析subShader来统计待计算的上下文变量。
    }
    static parseBlockDef(blockObj, blockDef){
        if(blockDef){
            switch (blockDef.getType()) {
                case "Def":
                    // 创建一个材质定义
                    blockObj.setName(blockDef.getName());
                    break;
                case "Params":
                    // 材质参数
                    // 解析材质参数列表
                    MaterialDef.parseParams(blockObj, blockDef);
                    break;
                case "SubTechnology":
                    // 子技术块
                    let subShaderDef = new SubShaderDef(blockDef.getName());
                    blockObj.addSubShaderDef(subShaderDef.getName(), subShaderDef);
                    // MaterialDef.parseSubTechnology(subShaderDef, blockDef);
                    // 设置subBlockDef的blockObj
                    blockObj = subShaderDef;
                    break;
                case "Vs_Shader":
                    // vs
                    // MaterialDef.parseShader(blockObj, blockDef);
                    break;
                case "Fs_Shader":
                    // fs
                    // MaterialDef.parseShader(blockObj, blockDef);
                    break;
                case "Vars":
                    MaterialDef.parseShaderVars(blockObj, blockDef);
                    break;
                case "Vs_Shader_Main":
                    MaterialDef.parseVsShaderMain(blockObj, blockDef);
                    break;
                case "Fs_Shader_Main":
                    MaterialDef.parseFsShaderMain(blockObj, blockDef);
                    break;
            }
            blockDef.getSubBlock().forEach(subBlockDef=>{
                MaterialDef.parseBlockDef(blockObj, subBlockDef);
            });
        }
    }

    /**
     * 获取块定义
     * @param {Block}[blockDef 块定义,结果将报错到这里]
     * @param {String}[data Def文件内容]
     * @param {Number}[startOffset 块定义起始偏移量]
     */
    static getBlockDef(blockDef, data, startOffset){
        let start = 1;
        let line = null;
        for(let i = startOffset + 1;i < data.length;i++){
            line = MaterialDef.trim(data[i]);
            if(!line.startsWith("//")){
                if(line.endsWith("{")){
                    // 增加了一个块
                    start++;

                    let block = line.substring(0, line.indexOf("{"));
                    // 块类型解析
                    let bsa = block.split(" ");
                    let blockType = bsa[0];
                    if(blockType == "void"){
                        blockType = blockDef.getType() + "_Main";
                    }
                    let blockId = "";
                    if(bsa.length > 1){
                        blockId = bsa[bsa.length - 1];
                    }
                    // 开始一个块
                    let subBlockDef = new Block(blockType, blockId, data, i);
                    if(start == 2){
                        // 只添加直接子块
                        blockDef.addSubBlock(subBlockDef);
                    }
                    // 查找该子块定义
                    this.getBlockDef(subBlockDef, data, i);
                }
                else if(line.endsWith("}")){
                    start--;
                }
                if(start == 0){
                    // 找到块定义
                    blockDef.setEnd(i);
                    break;
                }
            }
        }
    }
    static parse(data){
        // 解析每一行
        let startBlocks = {};
        let endBlocks = {};
        if(data){
            // 分割每一行
            data = data.split("\n");
            // console.log("data:\n",data);
            for(let i = 0;i < data.length;i++){
                let _line = MaterialDef.trim(data[i]);
                if(!_line.startsWith("//")){
                    if(_line.endsWith("{")){
                        let block = _line.substring(0, _line.indexOf("{"));

                        // 块类型解析
                        let bsa = block.split(" ");
                        let blockType = bsa[0];
                        if(blockType != "void"){
                            let blockId = "";
                            if(bsa.length > 1){
                                blockId = bsa[bsa.length - 1];
                            }
                            // 开始一个块
                            let blockDef = new Block(blockType, blockId, data, i);
                            MaterialDef.getBlockDef(blockDef, data, i);
                            // 开始解析块定义
                            let matDef = new MaterialDef();
                            MaterialDef.parseBlockDef(matDef, blockDef);
                            return matDef;
                            // console.log("matDef:",matDef);
                            break;
                        }
                    }
                }
            }
        }
        return null;
    }

}
