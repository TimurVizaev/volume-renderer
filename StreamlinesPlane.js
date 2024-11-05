//Timur Vizaev 2020

import * as THREE from '/libs/three.module.js';
import * as Utils from './Utils.js'

import { GUI } from './libs/dat.gui.module.js';
import { Line2 } from './lines/Line2.js';
import { LineMaterial } from './lines/LineMaterial.js';
import { LineGeometry } from './lines/LineGeometry.js';

class StreamlinesPlane
{
    constructor(index, canvas, renderer, camera, scene, mainControls, position, volumeScale, MaxVelocity)
    {
        this.Index = index;
        this.Canvas = canvas;
        this.Renderer = renderer;
        this.Camera = camera;
        this.Scene = scene;
        this.MainControls = mainControls;

        this.Position = position;
        this.VolumeScale = volumeScale;
        this.MaxVelocity = MaxVelocity;

        this.StreamlinesOutdated = true;

        this.Options = this.StreamlinesDefaultOptions();

        this.CreateGUI();
    }

    StreamlinesDefaultOptions = () =>
    {
        var options =
        {
            ShowStreamlines: true,
            ShowIntersectionPlane: true,
            Number: 100,
            dt: 5.0,
            MinVelocity: 0.1,
            GrowDirection: 'Forward',
            MaxSteps: 2000,
            Thickness: 3.0,

            StreamlinesHueOffset: 0.25,
            StreamlinesHueFactor: -1.8,
            StreamlinesSaturation: 1.0,
            StreamlinesLuminance: 0.5,

            ShowFlowValuesOnChart: true
        };
        return options;
    }

    //TODO: I dont like that SetXXX methods are required to be called. Find another way

    SetSpeedGetters(getX, getY, getZ) //It is required to call this method at initialization
    {
        this.GetSpeedX = getX;
        this.GetSpeedY = getY;
        this.GetSpeedZ = getZ;
    }

    SetTimePointInfoGetters(getCurrentTimePoint, getNextTimePoint, getCurrentTimePointFraction) //It is required to call this method at initialization
    {
        this.GetCurrentTimePoint = getCurrentTimePoint;
        this.GetNextTimePoint = getNextTimePoint;
        this.GetCurrentTimePointFraction = getCurrentTimePointFraction;
    }

    SetRenderFunc(func) //It is required to call this method at initialization
    {
        this.Render = func;
    }

    SetParentStreamlinesRemovedFunc(func) //It is required to call this method at initialization
    {
        this.ParentRemoveStreamlines = func;
    }

    Init()
    {
        this.ShowIntersectionPlane();
    }

    CreateGUI()
    {
        this.Options.RemoveStreamlines = this.RemoveStreamlines;

        this.StreamlinesGUI = new GUI();
        this.StreamlinesGUI.add(this.Options, 'ShowStreamlines').name('Show Streamlines').onChange(this.ShowStreamlinesChecked);
        this.ShowIntersectionPlaneCheckBox = this.StreamlinesGUI.add(this.Options, 'ShowIntersectionPlane').name('Show Plane').onChange(this.ShowIntersectionPlane);

        var folder = this.StreamlinesGUI.addFolder('Colors');
        folder.add(this.Options, 'StreamlinesHueOffset', 0.0, 1.0).name('Hue').onChange(this.StreamlinesParametersChanged);
        folder.add(this.Options, 'StreamlinesHueFactor', -2.0, 2.0).name('Hue Factor').onChange(this.StreamlinesParametersChanged);
        folder.add(this.Options, 'StreamlinesSaturation', 0.0, 1.0).name('Saturation').onChange(this.StreamlinesParametersChanged);
        folder.add(this.Options, 'StreamlinesLuminance', 0.0, 1.0).name('Luminance').onChange(this.StreamlinesParametersChanged);

        this.StreamlinesGUI.add(this.Options, 'Thickness', 0.1, 10.0).name('Thickness').onChange(this.StreamlinesThicknessChanged);
        this.StreamlinesGUI.add(this.Options, 'Number', 1, 300).name('Number').onChange(this.StreamlinesParametersChanged);
        this.StreamlinesGUI.add(this.Options, 'dt', 0.1, 100.0).name('Time Delta').onChange(this.StreamlinesParametersChanged);
        this.StreamlinesGUI.add(this.Options, 'MinVelocity', 0.001, 1.0).name('Min Velocity').onChange(this.StreamlinesParametersChanged);
        this.StreamlinesGUI.add(this.Options, 'MaxSteps', 10, 5000).name('Max Steps').onChange(this.StreamlinesParametersChanged);
        this.StreamlinesGUI.add(this.Options, 'GrowDirection', { forward: 'Forward', backwards: 'Backwards', both: 'Both' }).name('Grow Direction').onChange(this.StreamlinesParametersChanged);
        this.StreamlinesGUI.add(this.Options, 'RemoveStreamlines').name('Remove');

        this.StreamlinesGUI.add(this.Options, 'ShowFlowValuesOnChart').name('Show Flow Curve');
        
    }

    ShowStreamlinesChecked = () =>
    {
        if (this.Options.ShowStreamlines)
        {
            if (!this.Options.ShowIntersectionPlane)
            {
                this.ShowIntersectionPlaneCheckBox.setValue(true);
                this.ShowIntersectionPlaneCheckBox.updateDisplay();
            }

            this.ShowCurrentFrameStreamlinesVisuals();
        }
        else if (this.CurrentFrameVisuals)
        {
            this.RemovePreviousFrameStreamlinesVisuals();
        }
    }

    CreateIntersectionPlane = () =>
    {
        var geometry = new THREE.PlaneGeometry(50, 50, 1);
        var material = new THREE.MeshBasicMaterial({ color: 0xadf7ab, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
        this.IntersectionPlane = new THREE.Mesh(geometry, material);
        this.IntersectionPlane.position.x = this.Position.x;
        this.IntersectionPlane.position.y = this.Position.y;
        this.IntersectionPlane.position.z = this.Position.z;
        this.IntersectionPlane.renderOrder = 3;

        this.Scene.add(this.IntersectionPlane);
    }

    CreatePlaneTranformControls = () =>
    {
        this.PlaneTransformControls = Utils.GetDefaultTransformControls(this.Camera, this.Renderer, this.MainControls,
            this.IntersectionPlane, this.UpdateStreamlinesFromTransformControl);
        this.Scene.add(this.PlaneTransformControls);
    }


    ShowIntersectionPlane = () =>
    {
        if (!this.IntersectionPlane) { this.CreateIntersectionPlane(); }
        if (!this.PlaneTransformControls) { this.CreatePlaneTranformControls(); }

        this.IntersectionPlane.visible = this.Options.ShowIntersectionPlane;
        this.PlaneTransformControls.visible = this.Options.ShowIntersectionPlane;
        this.PlaneTransformControls.enabled = this.Options.ShowIntersectionPlane;

        if(this.Options.ShowIntersectionPlane)
        {
            window.ShowInfo("W translate | E rotate | R scale");
        }
        else
        {
            window.HideInfo();    
        }
    }

    UpdateStreamlinesFromTransformControl = () =>
    {
        if (!this.MainControls.enabled && this.Options.ShowStreamlines) //!this.MainControls.enabled means that we are dragging the control
        {
            this.ShowCurrentFrameStreamlinesVisuals();
        }
        this.Render();
    }


    StreamlinesParametersChanged = () =>
    {
        this.StreamlinesOutdated = true;
    }

    StreamlinesThicknessChanged = () =>
    {
        if (this.StreamlinesMaterial)
        {
            this.StreamlinesMaterial.dispose();
            this.StreamlinesMaterial = undefined;
            this.StreamlinesParametersChanged();
        }
    }

    RemoveStreamlines = () =>
    {
        this.ParentRemoveStreamlines(this.Index);

        if (!this.StreamlinesMaterial)
        {
            this.StreamlinesMaterial.dispose();
            this.StreamlinesMaterial = undefined;
        }

        this.RemovePreviousFrameStreamlinesVisuals();

        this.PlaneTransformControls.detach(this.IntersectionPlane);
        this.Scene.remove(this.PlaneTransformControls);

        this.Scene.remove(this.IntersectionPlane);

        this.StreamlinesGUI.destroy();
    }

    ShowCurrentFrameStreamlinesVisuals = () =>
    {
        this.RemovePreviousFrameStreamlinesVisuals();

        this.CurrentFrameVisuals = this.ComputeStreamlinesVisuals(this.GetCurrentTimePoint(), this.GetCurrentTimePointFraction());
        if (this.CurrentFrameVisuals)
        {
            this.Scene.add(this.CurrentFrameVisuals);
        }
    }

    RemovePreviousFrameStreamlinesVisuals = () =>
    {
        if (this.CurrentFrameVisuals)
        {
            this.Scene.remove(this.CurrentFrameVisuals);
            for (var i = 0; i < this.CurrentFrameVisuals.children.length; i++)
            {
                this.CurrentFrameVisuals.children[i].geometry.dispose(); //important, if not we will leak
            }
        }

        this.CurrentFrameVisuals = undefined;
    }

    ComputeStreamlinesVisuals(frame, time)
    {
        var frameStreamlineVisuals = new THREE.Group();

        if (!this.StreamlinesMaterial)
        {
            this.StreamlinesMaterial = new LineMaterial({ vertexColors: true, linewidth: this.Options.Thickness, dashed: false });
            if(window.IsRendererTransparent)
            {
                this.StreamlinesMaterial.transparent = true;
                this.StreamlinesMaterial.depthTest = true;
            }
            
            this.StreamlinesMaterial.resolution.set(MainCanvas.clientWidth, MainCanvas.clientHeight);
        }

        let streamlines = this.GetStreamlines(Math.floor(this.Options.Number), frame, time);
        if (streamlines.length == 0) { return null; }

        var color = new THREE.Color();
        for (var i = 0; i < streamlines.length; i++) 
        {
            var positions = [];
            var colors = [];

            let streamlinePoints = streamlines[i].Points;
            let streamlineVelocities = streamlines[i].Velocities;

            if (streamlinePoints.length == 0) { continue; }

            for (var j = 0; j < streamlinePoints.length; j++)
            {
                let p0 = streamlinePoints[j];
                positions.push(p0.x, p0.y, p0.z);

                // colors
                let vel = streamlineVelocities[j] / this.MaxVelocity;
                color.setHSL(this.Options.StreamlinesHueOffset + this.Options.StreamlinesHueFactor * vel,
                    this.Options.StreamlinesSaturation,
                    this.Options.StreamlinesLuminance);
                colors.push(color.r, color.g, color.b);
            }

            var geometry = new LineGeometry();
            geometry.setPositions(positions);
            geometry.setColors(colors);

            geometry.computeBoundingSphere();

            var visual = new Line2(geometry, this.StreamlinesMaterial);

            visual.computeLineDistances();
            frameStreamlineVisuals.add(visual);
        }

        //flow at base
        if (this.Options.ShowFlowValuesOnChart)
        {

            var both = this.Options.GrowDirection == 'Both';

            var planeNormal = new THREE.Vector3();
            planeNormal.set(0, 0, 1).applyQuaternion(this.IntersectionPlane.quaternion);

            var flow = 0;
            for (var i = 0; i < streamlines.length; i++) 
            {
                let streamline = streamlines[i];
                if (streamline.Points.length > 1)
                {
                    let basePointVelocity = streamline.Velocities[0];
                    let basePoint0 = streamline.Points[0];
                    let basePoint1 = streamline.Points[1];
                    let baseDirection = basePoint1.sub(basePoint0).normalize();

                    if(both)
                    {
                        basePointVelocity *= 0.5;
                    }
                    else
                    {
                        //project on the plane
                        let dot = planeNormal.dot(baseDirection);
                        basePointVelocity *= dot;
                    }
                    
                    flow += basePointVelocity;
                }
            }

            this.FlowValue = flow;
        }
        else
        {
            this.FlowValue = undefined;
        }

        return frameStreamlineVisuals;
    }

    GetStreamlines(num, timepoint, time)
    {
        var seeds = this.GetStreamlineSeeds(num);

        //streamlines
        var streamlines = [];
        var velocities;
        var points;

        let minimalVelocity = this.Options.MinVelocity;
        let maxSteps = this.Options.MaxSteps;

        let dirs = this.Options.GrowDirection == 'Both' ? 2 : 1;
        let idt = this.Options.GrowDirection == 'Backwards' ? -this.Options.dt : this.Options.dt;

        for (var i = 0; i < seeds.length; i++)
        {
            let dt = idt

            for (var dir = 0; dir < dirs; dir++)
            {
                velocities = new Array();
                points = new Array();

                let x0 = seeds[i].x;
                let y0 = seeds[i].y;
                let z0 = seeds[i].z;

                var point = new THREE.Vector3(x0, y0, z0);

                for (var j = 0; j < maxSteps; j++)
                {
                    let speed = this.GetSpeedVector(timepoint, time, point.x, point.y, point.z);
                    let velocity = speed.length();

                    if (velocity < minimalVelocity) { break; }

                    points.push(point.clone());
                    velocities.push(velocity);

                    point.addScaledVector(speed, dt);
                }

                if (points.length > 0)
                {
                    streamlines.push({ Points: points, Velocities: velocities });
                }

                dt = -dt;
            }

        }

        return streamlines;

    }

    GetSpeedVector(timepoint, time, xi, yi, zi)
    {
        let x = xi / this.VolumeScale.x;
        let y = yi / this.VolumeScale.y;
        let z = zi / this.VolumeScale.z;

        let xSpeed0 = this.GetSpeedX(timepoint, x, y, z);
        let ySpeed0 = this.GetSpeedY(timepoint, x, y, z);
        let zSpeed0 = this.GetSpeedZ(timepoint, x, y, z);

        let nextTimepoint = this.GetNextTimePoint(timepoint);
        let xSpeed1 = this.GetSpeedX(nextTimepoint, x, y, z);
        let ySpeed1 = this.GetSpeedY(nextTimepoint, x, y, z);
        let zSpeed1 = this.GetSpeedZ(nextTimepoint, x, y, z);

        var xSpeed = xSpeed0 * (1 - time) + xSpeed1 * time;
        var ySpeed = ySpeed0 * (1 - time) + ySpeed1 * time;
        var zSpeed = zSpeed0 * (1 - time) + zSpeed1 * time;
        if (xSpeed && ySpeed && zSpeed)
        {
            return new THREE.Vector3(-xSpeed, -ySpeed, zSpeed);
        }

        return new THREE.Vector3();
    }


    GetStreamlineSeeds(num)
    {
        var seeds = new Array(num);
        var points = Utils.GetEvenlyDistributedPoints(this.IntersectionPlane.scale.x * 100.0 / num, num);

        for (var i = 0; i < points.length; i++)
        {
            var transformedPoint = points[i];
            transformedPoint.applyQuaternion(this.IntersectionPlane.quaternion).add(this.IntersectionPlane.position);
            seeds[i] = transformedPoint;
        }

        return seeds;
    }


}


export { StreamlinesPlane }