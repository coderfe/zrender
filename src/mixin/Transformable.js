/**
 * 提供变换扩展
 * @module zrender/mixin/Transformable
 * @author pissang (https://www.github.com/pissang)
 */
define(function (require) {

    'use strict';

    var matrix = require('../core/matrix');
    var vector = require('../core/vector');
    var mIdentity = matrix.identity;

    var mTranslate = matrix.translate;

    var EPSILON = 5e-5;

    function isAroundZero(val) {
        return val > -EPSILON && val < EPSILON;
    }
    function isNotAroundZero(val) {
        return val > EPSILON || val < -EPSILON;
    }

    /**
     * @alias module:zrender/mixin/Transformable
     * @constructor
     */
    var Transformable = function (opts) {
        // If there are no given position, rotation, scale
        if (! opts.position) {
            /**
             * 平移
             * @type {Array.<number>}
             * @default [0, 0]
             */
            this.position = [0, 0];
        }
        if (opts.rotation == null) {
            /**
             * 旋转
             * @type {Array.<number>}
             * @default 0
             */
            this.rotation = 0;
        }
        if (! opts.scale) {
            /**
             * 缩放
             * @type {Array.<number>}
             * @default [1, 1]
             */
            this.scale = [1, 1];
        }
        /**
         * 旋转和缩放的原点
         * @type {Array.<number>}
         * @default null
         */
        this.origin = this.origin || null;

        /**
         * 是否有坐标变换
         * @type {boolean}
         * @readOnly
         */
        this.needTransform = false;
    };

    Transformable.prototype = {

        constructor: Transformable,

        transform: null,

        needLocalTransform: function () {
            return isNotAroundZero(this.rotation)
                || isNotAroundZero(this.position[0])
                || isNotAroundZero(this.position[1])
                || isNotAroundZero(this.scale[0] - 1)
                || isNotAroundZero(this.scale[1] - 1);
        },

        /**
         * 判断是否需要有坐标变换，更新needTransform属性。
         * 如果有坐标变换, 则从position, rotation, scale以及父节点的transform计算出自身的transform矩阵
         */
        updateTransform: function () {

            var parent = this.parent;
            var parentHasTransform = parent && parent.needTransform;
            var needLocalTransform = this.needLocalTransform();
            this.needTransform = needLocalTransform || parentHasTransform;

            if (!this.needTransform) {
                return;
            }

            var m = this.transform || matrix.create();

            if (needLocalTransform) {
                this.getLocalTransform(m);
            }
            else {
                mIdentity(m);
            }

            // 应用父节点变换
            if (parentHasTransform) {
                if (needLocalTransform) {
                    matrix.mul(m, parent.transform, m);
                }
                else {
                    matrix.copy(m, parent.transform);
                }
            }
            // 保存这个变换矩阵
            this.transform = m;

            this.invTransform = this.invTransform || matrix.create();
            matrix.invert(this.invTransform, m);
        },

        getLocalTransform: function (m) {
            m = m || [];
            mIdentity(m);

            var origin = this.origin;
            if (origin && isAroundZero(origin[0]) && isAroundZero(origin[1])) {
                origin = null;
            }

            var scale = this.scale;
            var rotation = this.rotation;
            var position = this.position;
            if (origin) {
                mTranslate(m, m, origin);
            }
            matrix.scale(m, m, scale);
            if (rotation) {
                matrix.rotate(m, m, rotation);
            }
            if (origin) {
                origin[0] = -origin[0];
                origin[1] = -origin[1];
                mTranslate(m, m, origin);
                origin[0] = -origin[0];
                origin[1] = -origin[1];
            }

            mTranslate(m, m, position);

            return m;
        },
        /**
         * 将自己的transform应用到context上
         * @param {Context2D} ctx
         */
        setTransform: function (ctx) {
            if (this.needTransform) {
                var m = this.transform;
                ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
            }
        },
        /**
         * 设置图形的朝向
         * @param  {Array.<number>|Float32Array} target
         * @method
         */
        lookAt: (function () {
            var v = vector.create();
            return function(target) {
                if (!this.transform) {
                    this.transform = matrix.create();
                }
                var m = this.transform;
                vector.sub(v, target, this.position);
                if (isAroundZero(v[0]) && isAroundZero(v[1])) {
                    return;
                }
                vector.normalize(v, v);
                var scale = this.scale;
                // Y Axis
                // TODO Scale origin ?
                m[2] = v[0] * scale[1];
                m[3] = v[1] * scale[1];
                // X Axis
                m[0] = v[1] * scale[0];
                m[1] = -v[0] * scale[0];
                // Position
                m[4] = this.position[0];
                m[5] = this.position[1];

                this.decomposeTransform();
            };
        })(),
        /**
         * 分解`transform`矩阵到`position`, `rotation`, `scale`
         */
        decomposeTransform: function () {
            if (!this.transform) {
                return;
            }
            var m = this.transform;
            var sx = m[0] * m[0] + m[1] * m[1];
            var position = this.position;
            var scale = this.scale;
            if (isNotAroundZero(sx - 1)) {
                sx = Math.sqrt(sx);
            }
            var sy = m[2] * m[2] + m[3] * m[3];
            if (isNotAroundZero(sy - 1)) {
                sy = Math.sqrt(sy);
            }
            position[0] = m[4];
            position[1] = m[5];
            scale[0] = sx;
            scale[1] = sy;
            this.rotation = Math.atan2(-m[1] / sy, m[0] / sx);
        },

        /**
         * 变换坐标位置到 shape 的局部坐标空间
         * @method
         * @param {number} x
         * @param {number} y
         * @return {Array.<number>}
         */
        transformCoordToLocal: function (x, y) {
            var v2 = [x, y];
            var invTransform = this.invTransform;
            if (this.needTransform && invTransform) {
                vector.applyTransform(v2, v2, invTransform);
            }
            return v2;
        },

        /**
         * 变换局部坐标位置到全局坐标空间
         * @method
         * @param {number} x
         * @param {number} y
         * @return {Array.<number>}
         */
        transformCoordToGlobal: function (x, y) {
            var v2 = [x, y];
            var transform = this.transform;
            if (this.needTransform && transform) {
                vector.applyTransform(v2, v2, transform);
            }
            return v2;
        }
    };

    return Transformable;
});
