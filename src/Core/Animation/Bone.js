import Node from "../Node/Node.js";

/**
 * Bone。<br/>
 * 表示骨骼的Node。<br/>
 * @author Kkk
 * @date 2021年3月8日15点58分
 */
export default class Bone extends Node{
    getType(){
        return 'Bone';
    }
    constructor(owner, cfg) {
        super(owner, cfg);
        this._m_Bind = null;
    }

    /**
     * 绑定Joint。<br/>
     * @param {Joint}[b]
     */
    bind(b){
        this._m_Bind = b;
    }

    /**
     * 返回绑定Joint。<br/>
     * @return {Joint}
     */
    getBind(){
        return this._m_Bind;
    }

}
