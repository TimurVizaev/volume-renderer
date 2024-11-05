import * as THREE from '/libs/three.module.js';
import { TransformControls } from './utils/TransformControls.js';

export function GetDefaultTransformControls(camera, renderer, mainControls, obj, onChange)
{
    var objControls = new TransformControls(camera, renderer.domElement);
    objControls.addEventListener('change', function()
    {
        if(!_this.visible) { return; }
        if(onChange) { onChange(); }
    });

    var _mainControls = mainControls;
    var _this = objControls;
    objControls.addEventListener('dragging-changed', function (event)
    {
        _mainControls.enabled = !event.value;
    });
    objControls.setSpace('local');

    window.addEventListener('keydown', function (event)
    {
        if(!_this.visible) { return; }

        switch (event.keyCode)
        {
            case 87: // W
                _this.setMode("translate");
                break;
            case 69: // E
                _this.setMode("rotate");
                break;
            case 82: // R
                _this.setMode("scale");
                break;
            case 187:
            case 107: // +, =, num+
                _this.setSize(_this.size + 0.1);
                break;

            case 189:
            case 109: // -, _, num-
                _this.setSize(Math.max(_this.size - 0.1, 0.1));
                break;
            case 88: // X
                _this.showX = !_this.showX;
                break;

            case 89: // Y
                _this.showY = !_this.showY;
                break;

            case 90: // Z
                _this.showZ = !_this.showZ;
                break;

            case 32: // Spacebar
                _this.visible = !_this.visible;
                break;
        }
    });

    objControls.attach(obj);

    return objControls;
}

export function GetEvenlyDistributedPoints(scaleFactor, num)
{
    var points = new Array(num);
    for (var i = 0; i < num; i++) 
    {
        var theta = 2.39998131 * i;
        var radius = scaleFactor * Math.sqrt(theta);
        var x = Math.cos(theta) * radius;
        var y = Math.sin(theta) * radius;

        points[i] = new THREE.Vector3(x, y, 0);
    }
    return points;
}

export function GetRandomBetween(min, max)
{
    return Math.random() * (max - min) + min;
}