//Timur Vizaev 2020

import * as THREE from '/libs/three.module.js';
import * as Utils from './Utils.js'

import { GUI } from './libs/dat.gui.module.js';
import { ParticleShader } from './ParticleShader.js';

class ParticleSystem
{
    constructor(index, canvas, renderer, camera, scene, mainControls, position, volumeScale, maxVelocity)
    {
        this.Index = index;
        this.Canvas = canvas;
        this.Renderer = renderer;
        this.Camera = camera;
        this.Scene = scene;
        this.MainControls = mainControls;

        this.Position = position;
        this.VolumeScale = volumeScale;
        this.MaxVelocity = maxVelocity;
        
        this.ParticlesOutdated = true;

        this.Options = this.ParticlesDefaultOptions();

        this.CreateGUI();

        this.GetAnimationSpeed = null;
    }

    ParticlesDefaultOptions = () =>
    {
        var options =
        {
            ShowParticles: true,
            ShowIntersectionPlane: true,
            Number: 500,
            dt: 5.0,
            MinVelocity: 0.002,
            Size: 3.0,

            ParticlesHueOffset: 0.6,
            ParticlesHueFactor: 2.0,
            ParticlesSaturation: 1.0,
            ParticlesLuminance: 0.5,
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

    SetParentParticlesRemovedFunc(func) //It is required to call this method at initialization
    {
        this.ParentRemoveParticles = func;
    }

    Init()
    {
        this.ShowIntersectionPlane();
    }

    CreateGUI()
    {
        this.Options.Reset = this.Reset;
        this.Options.RemoveParticles = this.RemoveParticles;

        this.ParticlesGUI = new GUI();
        this.ParticlesGUI.add(this.Options, 'ShowParticles').name('Show Particles').onChange(this.ShowParticlesChecked);
        this.ShowIntersectionPlaneCheckBox = this.ParticlesGUI.add(this.Options, 'ShowIntersectionPlane').name('Show Plane').onChange(this.ShowIntersectionPlane);
        this.ParticlesGUI.add(this.Options, 'Reset');

        var folder = this.ParticlesGUI.addFolder('Colors');
        folder.add(this.Options, 'ParticlesHueOffset', 0.0, 1.0).name('Hue');
        folder.add(this.Options, 'ParticlesHueFactor', -2.0, 2.0).name('Hue Factor');
        folder.add(this.Options, 'ParticlesSaturation', 0.0, 1.0).name('Saturation');
        folder.add(this.Options, 'ParticlesLuminance', 0.0, 1.0).name('Luminance');

        this.ParticlesGUI.add(this.Options, 'Size', 1.0, 10.0).name('Size').onChange(this.OnSizeChanged);
        this.ParticlesGUI.add(this.Options, 'Number', 1, 2000).name('Number').onChange(this.OnNumberOfParticlesChanged);
        this.ParticlesGUI.add(this.Options, 'dt', 0.1, 100.0).name('Time Delta').onChange(this.ParticlesParametersChanged);
        this.ParticlesGUI.add(this.Options, 'MinVelocity', 0.001, 0.1).name('Min Velocity').onChange(this.ParticlesParametersChanged);
        this.ParticlesGUI.add(this.Options, 'RemoveParticles').name('Remove');

    }

    ShowParticlesChecked = () =>
    {
        if (this.Options.ShowParticles)
        {
            if (!this.Options.ShowIntersectionPlane)
            {
                this.ShowIntersectionPlaneCheckBox.setValue(true);
                this.ShowIntersectionPlaneCheckBox.updateDisplay();
            }

            this.CreateParticles();
        }
        else if (this.Particles)
        {
            this.RemoveVisuals();
        }
    }

    OnNumberOfParticlesChanged = () =>
    {
        this.RemoveVisuals();
        this.Reset();
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
            this.IntersectionPlane, this.InitializeParticlesAtPlane);
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

    InitializeParticlesAtPlane = () =>
    {
        if (!this.MainControls.enabled && this.Options.ShowParticles) //!this.MainControls.enabled means that we are dragging the control
        {
            this.Reset();
        }
        this.Render();
    }


    ParticlesParametersChanged = () =>
    {
        this.ParticlesOutdated = true;
        this.UpdateParticles();
    }

    OnSizeChanged = () =>
    {
        this.ParticlesMaterial.uniforms['u_PointSize'].value = this.Options.Size;
    }

    RemoveParticles = () =>
    {
        this.ParentRemoveParticles(this.Index);

        if (this.ParticlesMaterial)
        {
            this.ParticlesMaterial.dispose();
            this.ParticlesMaterial = undefined;
        }

        this.RemoveVisuals();

        this.PlaneTransformControls.detach(this.IntersectionPlane);
        this.Scene.remove(this.PlaneTransformControls);

        this.Scene.remove(this.IntersectionPlane);

        this.ParticlesGUI.destroy();
    }

    UpdateParticles = () => //this is a mess, particles are sticking to the walls..
    {
        if(this.Positions)
        {
            let dt = 0.2 * this.Options.dt * this.GetAnimationSpeed();
            let n = Math.floor(this.Options.Number);

            var color = new THREE.Color();

            for(var i = 0; i < n; i++)
            {
                let x = this.Positions.array[i * 3 + 0];
                let y = this.Positions.array[i * 3 + 1];
                let z = this.Positions.array[i * 3 + 2];

                let delta = this.GetSpeedVector(this.GetCurrentTimePoint(), this.GetCurrentTimePointFraction(), x, y, z);

                var preventMovement = false;

                let nextX = x + dt * delta.x * this.VolumeScale.x;
                let nextY = y + dt * delta.y * this.VolumeScale.y;
                let nextZ = z + dt * delta.z * this.VolumeScale.z;
                if(this.Stoptimes.array[i] > 0.5) //particle is stuck
                {
                    //try look around
                    for(var j = 0; j < 5; j++)
                    {
                        let spread = 3.0;
                        delta = this.GetSpeedVector(this.GetCurrentTimePoint(), this.GetCurrentTimePointFraction(), 
                        x + Utils.GetRandomBetween(-spread, spread),
                        y + Utils.GetRandomBetween(-spread, spread),
                        z + Utils.GetRandomBetween(-spread, spread));

                        if(delta.length() / this.MaxVelocity > 0.2)
                        { 
                            break;
                        }
                    }
                }
                else
                {
                    let nextDelta = this.GetSpeedVector(this.GetCurrentTimePoint(), this.GetCurrentTimePointFraction(), nextX, nextY, nextZ);

                    if((nextDelta.length() / this.MaxVelocity) < this.Options.MinVelocity) //if the particle gets there it can be stuck
                    {
                        preventMovement = true;
                    }
                }

                for(var j = 0; j < 4; j++)
                {
                    if((delta.length() / this.MaxVelocity) <  this.Options.MinVelocity)
                    {
                        let spread = 1.0;
                        delta = this.GetSpeedVector(this.GetCurrentTimePoint(), this.GetCurrentTimePointFraction(), 
                        x + Utils.GetRandomBetween(-spread, spread),
                        y + Utils.GetRandomBetween(-spread, spread),
                        z + Utils.GetRandomBetween(-spread, spread));
                    }
                    else
                    {
                        break;
                    }
                }

                if(!preventMovement && ((delta.length() / this.MaxVelocity) > this.Options.MinVelocity)) 
                {
                    nextX = x + dt * delta.x * this.VolumeScale.x;
                    nextY = y + dt * delta.y * this.VolumeScale.y;
                    nextZ = z + dt * delta.z * this.VolumeScale.z;

                    this.Positions.array[i * 3 + 0] = nextX;
                    this.Positions.array[i * 3 + 1] = nextY;
                    this.Positions.array[i * 3 + 2] = nextZ;

                    this.Stoptimes.array[i] = 0.0;
                }
                else
                {
                    this.Stoptimes.array[i] += this.GetAnimationSpeed() * 0.01;
                }

                let vel = delta.length() / this.MaxVelocity;
                if(preventMovement) { vel = 0; }
                color.setHSL(this.Options.ParticlesHueOffset + this.Options.ParticlesHueFactor * vel,
                    this.Options.ParticlesSaturation,
                    this.Options.ParticlesLuminance);


                this.Colors.array[i * 3 + 0] = color.r;
                this.Colors.array[i * 3 + 1] = color.g;
                this.Colors.array[i * 3 + 2] = color.b;
            }

            this.Positions.needsUpdate = true;
            this.Colors.needsUpdate = true;
            this.Stoptimes.needsUpdate = true;
        }
    }

    Reset = () =>
    {
        if(this.Positions)
        {
            let n = Math.floor(this.Options.Number);
            let seeds = this.GetSeeds(n);

            var color = new THREE.Color();
            color.setHSL(this.Options.ParticlesHueOffset + this.Options.ParticlesHueFactor * 0.0,
                this.Options.ParticlesSaturation,
                this.Options.ParticlesLuminance);

            for(var i = 0; i < n; i++)
            {
                this.Positions.array[i * 3 + 0] = seeds[i].x;
                this.Positions.array[i * 3 + 1] = seeds[i].y;
                this.Positions.array[i * 3 + 2] = seeds[i].z;

                this.Colors.array[i * 3 + 0] = color.r;
                this.Colors.array[i * 3 + 1] = color.g;
                this.Colors.array[i * 3 + 2] = color.b;

                this.Stoptimes.array[i] = 0.0;
            }

            this.Positions.needsUpdate = true;
            this.Colors.needsUpdate = true;
            this.Stoptimes.needsUpdate = true;
        }
        else
        {
            this.CreateParticles();
        }
    }

    CreateParticles = () =>
    {
        let n = Math.floor(this.Options.Number);
        let seeds = this.GetSeeds(n);

        var geometry = new THREE.BufferGeometry();

		var positions = [];
		var colors = [];
		var stoptimes = [];

        var color = new THREE.Color();
        color.setHSL(this.Options.ParticlesHueOffset + this.Options.ParticlesHueFactor * 0.0,
            this.Options.ParticlesSaturation,
            this.Options.ParticlesLuminance);

        for ( var i = 0; i < n; i ++ ) 
        {
			// positions
			var x = seeds[i].x;
			var y = seeds[i].y;
            var z = seeds[i].z;

			positions.push( x, y, z );

			// colors
            colors.push( color.r, color.g, color.b );
            
            stoptimes.push(0.0);
		}

        this.Positions =  new THREE.Float32BufferAttribute( positions, 3 );
        this.Colors =  new THREE.Float32BufferAttribute( colors, 3 );
        this.Stoptimes =  new THREE.Float32BufferAttribute( stoptimes, 1 );
		geometry.setAttribute( 'position', this.Positions);
		geometry.setAttribute( 'color', this.Colors);
		geometry.setAttribute( 'stoptime', this.Stoptimes);

		geometry.computeBoundingSphere();
        //
        
        if(!this.ParticlesMaterial)
        {
            var shader = ParticleShader;
            var uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    
            this.ParticlesMaterial = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: shader.VertexShader.value,
                fragmentShader: shader.FragmentShader.value,
                transparent: true,
                depthTest: false,
                depthWrite: false
            });
        }
        
        this.Particles = new THREE.Points( geometry, this.ParticlesMaterial );
        this.Particles.renderOrder = 6;
        this.Particles.frustumCulled = false; //important

		this.Scene.add( this.Particles );
    }

    RemoveVisuals = () =>
    {
        this.Positions = undefined;
        this.Colors = undefined;
        this.Stoptimes = undefined;
		this.Scene.remove( this.Particles );
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


    GetSeeds(num)
    {
        var seeds = new Array(num);
        var points = Utils.GetEvenlyDistributedPoints(this.IntersectionPlane.scale.x * 0.25, num);

        for (var i = 0; i < points.length; i++)
        {
            var transformedPoint = points[i];
            transformedPoint.applyQuaternion(this.IntersectionPlane.quaternion).add(this.IntersectionPlane.position);
            seeds[i] = transformedPoint;
        }

        return seeds;
    }


}


export { ParticleSystem }