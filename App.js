//Timur Vizaev 2020

import * as THREE from './libs/three.module.js';
import * as Options from './AppOptions.js';
import * as Utils from './Utils.js'

import { GUI } from './libs/dat.gui.module.js';
import { OrbitControls } from './utils/OrbitControls.js';
import { VolumeRenderShader } from './VolumeShader.js';
import { WEBGL } from './libs/WebGL.js';
import Stats from './libs/stats.module.js';
import { VolumeSequence } from './VolumeSequence.js';
import { OrientationCube } from './utils/OrientationCube.js';
import { CustomBinaryVolumeReader } from './CustomBinaryVolumeReader.js';
import { StreamlinesPlane } from './StreamlinesPlane.js';
import { ParticleSystem } from './ParticleSystem.js';

//temp
import { SpeedFieldShader } from './SpeedFieldShader.js';

var Renderer;
var Scene;
var Camera;
var Controls;
var Cube;

var MainCanvas = document.getElementById('MainCanvas');

var Sequence = new VolumeSequence();
var SpeedXSequence = new VolumeSequence();
var SpeedYSequence = new VolumeSequence();
var SpeedZSequence = new VolumeSequence();

var Material;
var ColormapTextures;
var GPUStats;
var MainGUI;

var CurrentTime = 0;
var CurrentFrame = 0; //Rename as TimePoint

var VolumeGeometry;
var VolumeMesh;

var Frames = [];
var SpeedFrames = [];

const AutoRotationStep = 0.01;

var VolumeSizeX;
var VolumeSizeY;
var VolumeSizeZ;
var VolumeScale;

//Listen change event of the FileInput
const inputElement = document.getElementById("fileInput");
inputElement.addEventListener("change", HandleFiles, false);
function HandleFiles() {
	if (this.files.length == 0) { return; }
	LoadFiles(this.files);
}

function LoadFiles(files) {
	let ext = files[0].name.split('.').pop().toUpperCase();
	if (ext == "BIN") {
		var onStart = ShowLoading;
		var onEnd = HideLoading;
		ReadVolumes(files, onStart, onEnd);
	}
	else {
		console.error('Unknown file format');
	}
}

function ReadVolumes(files, onStart, onEnd) {
	if (window.LoadArgument == Options.LoadArgumentType.Magnitude) {
		ReadMagnitudeVolumes(files, onStart, onEnd, -1);
	}
	else if (window.LoadArgument == Options.LoadArgumentType.Velocity) {
		if (files.length % 3 == 0) //multiple of 3 (x, y, z)
		{
			if (Sequence && Sequence.Volumes.length * 3 != files.length) {
				console.error('Velocity files do not match with magnitudes');
			}
			else {
				var onVelocityVolumesReadEnd = function () {
					UpdateCheckbox(ShowVelocitiesCheckBox, true);
					UpdateCheckbox(AnimateCheckBox, true);
					onEnd();
				}

				ReadVelocityVolumes(files, onStart, onVelocityVolumesReadEnd, -1);
			}
		}
		else {
			console.error('Velocity files not multiple of 3');
		}
	}
}

function ReadMagnitudeVolumes(files, onStart, onEnd, currentPos) {
	currentPos++;
	if (currentPos == files.length) {
		if (onEnd) { onEnd(); }

		console.log('Initializing Magnitude Volume');
		InitVolumeBox();
	}
	else {
		let reader = new CustomBinaryVolumeReader();

		var seq = GetSequence(VolumeComponent.Magnitude);
		var file = files[currentPos];
		console.log('Reading binary volume ' + file.name);
		reader.Load(file, onStart, function (volume) {
			seq.Add(volume);
			ReadMagnitudeVolumes(files, onStart, onEnd, currentPos);
		});
	}
}

function ReadVelocityVolumes(files, onStart, onEnd, currentPos) {
	currentPos++;
	if (currentPos == files.length) {
		if (onEnd) { onEnd(); }

		console.log('Initializing Velocity Volume');
		InitSpeeds();
	}
	else {
		let reader = new CustomBinaryVolumeReader();

		var currentComponentIndex = Math.floor(currentPos * 3 / files.length) + 1; //X => 1, Y => 2, Z => 3
		var seq = GetSequence(currentComponentIndex);
		var file = files[currentPos];
		console.log('Reading binary volume ' + file.name);
		reader.Load(file, onStart, function (volume) {
			seq.Add(volume);
			ReadVelocityVolumes(files, onStart, onEnd, currentPos);
		});
	}
}

var VolumeComponent = { Magnitude: 0, VelocityX: 1, VelocityY: 2, VelocityZ: 3 }
function GetSequence(component) {
	if (component == VolumeComponent.Magnitude) {
		return Sequence;
	}
	else if (component == VolumeComponent.VelocityX) {
		return SpeedXSequence;
	}
	else if (component == VolumeComponent.VelocityY) {
		return SpeedYSequence;
	}
	else if (component == VolumeComponent.VelocityZ) {
		return SpeedZSequence;
	}
}

function InitVolumeBox() {
	Controls.target.set(Sequence.xLength / 2, Sequence.xLength / 2, Sequence.xLength / 2);

	for (var i = 0; i < Sequence.Volumes.length; i++) {
		let volume = Sequence.Volumes[i];
		// Texture to hold the volume. We have scalars, so we put our data in the red channel.
		// THREEJS will select R32F (33326) based on the THREE.RedFormat and THREE.FloatType.
		// Also see https://www.khronos.org/registry/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE
		var texture = new THREE.DataTexture3D(volume.data, volume.xLength, volume.yLength, volume.zLength);

		if (volume.type == 'uint8_4') {
			texture.type = THREE.UnsignedByteType;
			texture.format = THREE.RGBAFormat;
		}
		else if (volume.type == 'float') {
			texture.type = THREE.FloatType;
			texture.format = THREE.RedFormat;
		}
		//texture.minFilter = texture.magFilter = THREE.NearestFilter;
		texture.minFilter = texture.magFilter = THREE.LinearFilter;
		texture.unpackAlignment = 1;
		//texture.anisotropy = 16;

		Frames.push(texture);
	}

	//var maskData = GetRateOfChangeMask(Sequence);
	//var maskTexture = new THREE.DataTexture3D(maskData, Sequence.xLength, Sequence.yLength, Sequence.zLength / 2);
	//maskTexture.type = THREE.FloatType;
	//maskTexture.format = THREE.RedFormat;
	//maskTexture.minFilter = maskTexture.magFilter = THREE.LinearFilter;
	//maskTexture.unpackAlignment = 1;

	// Colormap textures
	ColormapTextures =
	{
		Viridis: new THREE.TextureLoader().load('./resources/viridis.png', render),
		Fire: new THREE.TextureLoader().load('./resources/fire.png', render),
		Gray: new THREE.TextureLoader().load('./resources/gray.png', render),
	};

	var shader = VolumeRenderShader;
	var uniforms = THREE.UniformsUtils.clone(shader.uniforms);

	uniforms["u_frame0"].value = Frames[0];
	uniforms["u_frame1"].value = Frames[1];
	//uniforms["u_Mask"].value = maskTexture;
	uniforms["u_VolumeSize"].value.set(Sequence.xLength, Sequence.yLength, Sequence.zLength);
	uniforms["u_ColorRange"].value.set(Options.Render.ColorRange1, Options.Render.ColorRange2);
	uniforms["u_ISOThreshold"].value = Options.Render.ISOThreshold;
	uniforms["u_MIPColorMap"].value = ColormapTextures[Options.Render.MIPColorMap];
	uniforms["u_ISOColorMap"].value = ColormapTextures[Options.Render.ISOColorMap];
	uniforms["u_SpeedColorMap"].value = ColormapTextures[Options.Render.SpeedColorMap];

	Camera.position.set(0, 0, 2 * Sequence.zLength);

	Material = new THREE.ShaderMaterial({
		uniforms: uniforms,
		vertexShader: shader.VertexShader.value,
		fragmentShader: shader.FragmentShader.value,
		side: THREE.BackSide, // The volume shader uses the backface as its "reference point",
		transparent: true,
		depthTest: false
	});

	VolumeGeometry = new THREE.BoxBufferGeometry(Sequence.xLength, Sequence.yLength, Sequence.zLength);
	VolumeGeometry.translate(Sequence.xLength / 2, Sequence.yLength / 2, Sequence.zLength / 2);

	VolumeMesh = new THREE.Mesh(VolumeGeometry, Material);

	VolumeScale = new THREE.Vector3(1.0, 1.0, 1.5);
	VolumeMesh.scale.set(VolumeScale.x, VolumeScale.y, VolumeScale.z);

	VolumeSizeX = Sequence.xLength;
	VolumeSizeY = Sequence.yLength;
	VolumeSizeZ = Sequence.zLength;

	Scene.add(VolumeMesh);

	UpdateVisibleRange();
	updateUniforms();

	Controls.update();
}

var MaxVelocity;
var HasVelocity = false;
function InitSpeeds() {
	let sizeX = SpeedXSequence.Volumes.length;
	let sizeY = SpeedYSequence.Volumes.length;
	let sizeZ = SpeedZSequence.Volumes.length;
	if (sizeX != sizeY || sizeX != sizeZ) {
		console.error('Size of velocity sequences do not match');
		return;
	}

	let max = -Number.MAX_VALUE;

	for (var i = 0; i < sizeX; i++) {
		let xVol = SpeedXSequence.Volumes[i];
		let yVol = SpeedYSequence.Volumes[i];
		let zVol = SpeedZSequence.Volumes[i];
		let dataLength = xVol.data.length;

		let speedData = new Float32Array(dataLength);

		for (var j = 0; j < dataLength; j++) {
			let x = xVol.data[j];
			let y = yVol.data[j];
			let z = zVol.data[j];
			let speed = Math.sqrt(x * x + y * y + z * z);
			speedData[j] = speed;

			if (speed > max) { max = speed; }
		}

		var texture = new THREE.DataTexture3D(speedData, xVol.xLength, xVol.yLength, xVol.zLength);
		texture.type = THREE.FloatType;
		texture.format = THREE.RedFormat;
		texture.minFilter = texture.magFilter = THREE.LinearFilter;
		texture.unpackAlignment = 1;

		SpeedFrames.push(texture);
	}

	MaxVelocity = max;
	HasVelocity = true;
}

if (WEBGL.isWebGL2Available() === false) {
	document.body.appendChild(WEBGL.getWebGL2ErrorMessage());
}

init();

function init() {
	SetBackground();

	Scene = new THREE.Scene();
	// Create renderer
	window.IsRendererTransparent = true;
	var context = MainCanvas.getContext('webgl2', { alpha: window.IsRendererTransparent, antialias: true });
	Renderer = new THREE.WebGLRenderer({ canvas: MainCanvas, context: context });
	Renderer.setClearColor(0x000000, 0);

	UpdateResolution();
	// Create camera (The volume renderer does not work very well with perspective yet)
	var h = 512; // frustum height
	var aspect = MainCanvas.clientWidth / MainCanvas.clientHeight;
	Camera = new THREE.OrthographicCamera(- h * aspect / 2, h * aspect / 2, h / 2, - h / 2, -10000, 10000);
	Camera.position.set(0, 0, 0);
	Camera.up.set(0, 0, 1); // In our data, z is up

	// Create controls
	Controls = new OrbitControls(Camera, Renderer.domElement);
	Controls.addEventListener('change', render);
	Controls.minZoom = 0.1;
	Controls.maxZoom = 40;

	//Raycaster = new THREE.Raycaster();

	GPUStats = new Stats();
	GPUStats.domElement.style.cssText = 'position:fixed;top:10px;left:21.0%;cursor:pointer;opacity:0.8;z-index:10000';
	document.getElementById('MainViewport').appendChild(GPUStats.domElement);

	//document.addEventListener('mousemove', onDocumentMouseMove, false);
	//document.addEventListener('click', onDocumentMouseClick, false);

	CreateGUI();
	OnOrientationCubeVisibilityChange();
	OnFlowChartVisibilityChange();

	Animate();
	Controls.update();

	window.addEventListener('resize', onWindowResize, false);

	AddKeyboardShortcutsEventListeners();
}


function Animate() {
	if (Options.Render && Options.Render.rotate) {
		Controls.rotateLeft(Options.Render.rotationSpeed * AutoRotationStep);
		Controls.update();
	}
	else {
		render();
	}

	GPUStats.update();
	requestAnimationFrame(Animate);
}

function render() {
	Renderer.render(Scene, Camera);

	if (Options.Tools.ShowOrientationCube) {
		Cube.Render(Camera, Controls);
	}

	if (Options.Render && Options.Render.animate && Frames.length > 1) {
		CurrentTime += 0.1 * Options.Render.speed;
		if (CurrentTime >= 1.0) {
			CurrentTime = 0;
			SetFrame(GetNextFrame(CurrentFrame));

			UpdateSpeedField();
		}

		Material.uniforms["u_frameTransition"].value = CurrentTime;
	}

	UpdateStreamlinesRender();
	UpdateParticlesRender();

	if (IsRecording) {
		if (FramesRecorded == 0) { Capturer.start(); }
		if (FramesRecorded < Options.Tools.VideoTotalFrames) {
			FramesRecorded++;
			Capturer.capture(Renderer.getContext().canvas);
		}
		else { StopRecording(); }
	}


	//temp
	if (linesMesh) {
		linesMesh.material.uniforms['u_frameTransition'].value = CurrentTime;
	}

}

function UpdateStreamlinesRender() {
	if (StreamlinesPlanes) {
		var flowValues = [];
		var flowIndices = [];

		for (var i = 0; i < StreamlinesPlanes.length; i++) {
			let sp = StreamlinesPlanes[i];
			if (sp.Options.ShowStreamlines && sp.StreamlinesOutdated) {
				sp.ShowCurrentFrameStreamlinesVisuals();
			}

			sp.StreamlinesOutdated = Options.Render.animate && Options.Render.interpolateFrame;

			//flow
			if (Options.Render.animate && Options.Tools.ShowFlowChart) {
				flowValues.push([sp.FlowValue ? sp.FlowValue : 0]);
				flowIndices.push(sp.Index);
			}
		}

		if (Options.Render.animate && Options.Tools.ShowFlowChart && flowValues.length > 0) {
			Plotly.extendTraces('FlowChart', { y: flowValues }, flowIndices);
			NextFlowValue();
		}
	}
}

function UpdateParticlesRender() {
	if (ParticleSystems) {
		for (var i = 0; i < ParticleSystems.length; i++) {
			let sp = ParticleSystems[i];
			if (sp.Options.ShowParticles && sp.ParticlesOutdated) {
				sp.UpdateParticles();
			}

			sp.ParticlesOutdated = Options.Render.animate && Options.Render.interpolateFrame;
		}
	}
}

function SetFrame(frame) {
	CurrentFrame = frame;

	Material.uniforms["u_frame0"].value = Frames[CurrentFrame];
	Material.uniforms["u_frame1"].value = Frames[GetNextFrame(CurrentFrame)];

	if (SpeedFrames.length == Frames.length && Options.Render.IsSpeedOverlayEnabled) {
		Material.uniforms["u_speed0"].value = SpeedFrames[CurrentFrame];
		Material.uniforms["u_speed1"].value = SpeedFrames[GetNextFrame(CurrentFrame)];
	}

	Material.uniforms["u_frameTransition"].value = 0;

	StreamlinesOutdated();
}

function StreamlinesOutdated() {
	for (var i = 0; i < StreamlinesPlanes.length; i++) {
		StreamlinesPlanes[i].StreamlinesOutdated = true;
	}
}

function SetNextFrame() {
	UpdateCheckbox(AnimateCheckBox, false);
	SetFrame(GetNextFrame(CurrentFrame));
}

function SetPreviousFrame() {
	UpdateCheckbox(AnimateCheckBox, false);
	SetFrame(GetPreviousFrame(CurrentFrame));
}

function GetNextFrame(currentFrame) { return currentFrame == Frames.length - 1 ? 0 : currentFrame + 1; }
function GetPreviousFrame(currentFrame) { return currentFrame == 0 ? Frames.length - 1 : currentFrame - 1; }

function AddKeyboardShortcutsEventListeners() {
	document.addEventListener('keydown', (e) => {
		if (e.altKey) {
			if (Cube) {
				let isKey = e.code.substring(0, 3) === 'Key';
				if (isKey) {
					Cube.SetView(e.code.substring(3, 4));
					e.preventDefault();
					e.stopPropagation();
				}
			}
		}
		else {
			if (e.code === 'KeyA') {
				UpdateCheckbox(AnimateCheckBox, !Options.Render.animate);
			}
		}
	});

	//keydown Alt+P is not being captured for some unknown reason. Workaround:
	document.addEventListener('keyup', (e) => {
		if (e.altKey && e.code === 'KeyP' && Cube) { Cube.SetView('P'); }
	});
}

function ConnectActionsInOptions() {
	Options.View.SetNextFrame = SetNextFrame;
	Options.View.SetPreviousFrame = SetPreviousFrame;
	Options.Tools.TakeScreenshot = TakeScreenshot;
	Options.Tools.RecordVideo = RecordVideo;

	Options.Tools.AddStreamlinesPlane = AddStreamlinesPlane;
	Options.Tools.AddParticles = AddParticles;
	Options.Tools.AddSpeedField = AddSpeedField;

}

var ShowVelocitiesCheckBox;
var AnimateCheckBox;

function CreateGUI() {
	ConnectActionsInOptions();

	MainGUI = new GUI();
	MainGUI.add(Options.View, 'LoadMagnitudes').name('Load Files');
	MainGUI.add(Options.View, 'LoadVelocities').name('Load Velocities');

	var folder = MainGUI.addFolder('Animation');
	AnimateCheckBox = folder.add(Options.Render, 'animate').name('Animate');
	folder.add(Options.Render, 'speed', 0.1, 4.0).name('Animation Speed');
	folder.add(Options.Render, 'interpolateFrame').name('Interpolate Frame').onChange(updateUniforms);
	folder.add(Options.View, 'SetNextFrame').name('Next Frame');
	folder.add(Options.View, 'SetPreviousFrame').name('Previous Frame');
	folder.add(Options.Render, 'rotate').name('Rotate');
	folder.add(Options.Render, 'rotationSpeed', 0.01, 2.0).name('Rotation Speed');

	folder = MainGUI.addFolder('Render Options');
	folder.add(Options.Render, 'ColorRange1', 0.0, 1.0).name('Color Threshold 1').onChange(updateUniforms);
	folder.add(Options.Render, 'ColorRange2', 0.0, 1.0).name('Color Threshold 2').onChange(updateUniforms);
	folder.add(Options.Render, 'ISOColorMap', { gray: 'Gray', viridis: 'Viridis', fire: 'Fire' }).name('ISO Color Map').onChange(updateUniforms);
	folder.add(Options.Render, 'MIPColorMap', { gray: 'Gray', viridis: 'Viridis', fire: 'Fire' }).name('MIP Color Map').onChange(updateUniforms);
	folder.add(Options.Render, 'SpeedColorMap', { gray: 'Gray', viridis: 'Viridis', fire: 'Fire' }).name('Speed Color Map').onChange(updateUniforms);
	folder.add(Options.Render, 'ISOContribution', 0.0, 1.0).name('ISO Contribution').onChange(updateUniforms);
	folder.add(Options.Render, 'MIPContribution', 0.0, 1.0).name('MIP Contribution').onChange(updateUniforms);
	folder.add(Options.Render, 'ISOThreshold', 0, 1, 0.01).name('ISO Threshold').onChange(updateUniforms);

	ShowVelocitiesCheckBox = folder.add(Options.Render, 'IsSpeedOverlayEnabled').name('Show Velocities').onChange(updateUniforms);
	folder.add(Options.Render, 'SpeedContribution', 0.0, 1.0).name('Speed Contribution').onChange(updateUniforms);

	folder = MainGUI.addFolder('Area of Interest');
	folder.add(Options.Render, 'ShowAreaOfInterest', 0.0, 1.0).name('Position').onChange(ShowAreaOfInterest);
	folder.add(Options.Render, 'AreaOfInterestAccentuator', 0.0, 2.0).name('Accentuator').onChange(OnAreaOfInterestUpdate);

	folder = MainGUI.addFolder('Clip Planes');
	folder.add(Options.Render, 'XRangeStart', 0.0, 1.0).onChange(UpdateVisibleRange).name('X Start');
	folder.add(Options.Render, 'XRangeEnd', 0.0, 1.0).onChange(UpdateVisibleRange).name('X End');
	folder.add(Options.Render, 'YRangeStart', 0.0, 1.0).onChange(UpdateVisibleRange).name('Y Start');
	folder.add(Options.Render, 'YRangeEnd', 0.0, 1.0).onChange(UpdateVisibleRange).name('Y End');
	folder.add(Options.Render, 'ZRangeStart', 0.0, 1.0).onChange(UpdateVisibleRange).name('Z Start');
	folder.add(Options.Render, 'ZRangeEnd', 0.0, 1.0).onChange(UpdateVisibleRange).name('Z End');

	folder = MainGUI.addFolder('Tools');
	folder.add(Options.Render, 'ResolutionFactor', 0.1, 1.0).name('Resolution').onChange(UpdateResolution);
	folder.addColor(Options.View, 'Color1').name('Color 1').onChange(SetBackground);
	folder.addColor(Options.View, 'Color2').name('Color 1').onChange(SetBackground);
	folder.add(Options.View, 'GradientStyle',
		{
			Radial: 'radial',
			Vertical: 'to bottom',
			Horizontal: 'to right',
			LeftCorner: 'to top left',
			RightCorner: 'to top right'
		}).name('Gradient Style').onChange(SetBackground);

	folder.add(Options.Tools, 'ShowOrientationCube').name('Orientation Cube').onChange(OnOrientationCubeVisibilityChange);
	folder.add(Options.Tools, 'ShowFlowChart').name('Flow Chart').onChange(OnFlowChartVisibilityChange);
	folder.add(Options.Tools, 'AddStreamlinesPlane').name('Add Streamlines');

	folder.add(Options.Tools, 'TakeScreenshot').name('Take Screenshot');
	folder2 = folder.addFolder('Screenshot Options');
	folder2.add(Options.Tools, 'ImageTransparent').name('Transparent');
	folder2.add(Options.Tools, 'ImageUseCustomSize').name('Custom Size');
	folder2.add(Options.Tools, 'ImageWidth').name('Width');
	folder2.add(Options.Tools, 'ImageHeight').name('Height');
	folder.add(Options.Tools, 'RecordVideo').name('Record Video');
	var folder2 = folder.addFolder('Video Options');
	folder2.add(Options.Tools, 'VideoFramerate', ['12', '24', '30', '60']).name('Framerate').onChange(VideoOptionsChanged);
	folder2.add(Options.Tools, 'VideoDuration', 1, 8).name('Duration').onChange(VideoOptionsChanged);
	folder2.add(Options.Tools, 'VideoFormat', ['webm', 'png', 'jpg']).name('Format');
	folder2.add(Options.Tools, 'VideoUseCustomSize').name('Custom Size');
	folder2.add(Options.Tools, 'VideoWidth').name('Width');
	folder2.add(Options.Tools, 'VideoHeight').name('Height');

	folder = MainGUI.addFolder('Experimental');
	folder.add(Options.Tools, 'AddParticles').name('Add Particles');
	folder.add(Options.Tools, 'AddSpeedField').name('Add Speed Field');
}

var StreamlinesPlanes = [];

function AddStreamlinesPlane() {
	if (!HasVelocity) {
		alert("Please load Velocity Data first");
		return;
	}
	var position = new THREE.Vector3(VolumeSizeX / 2, VolumeSizeY / 2, VolumeSizeZ / 2);
	var sp = new StreamlinesPlane(StreamlinesPlanes.length, MainCanvas, Renderer, Camera, Scene, Controls, position, VolumeScale, MaxVelocity);
	sp.SetSpeedGetters(GetSpeedX, GetSpeedY, GetSpeedZ);
	sp.SetTimePointInfoGetters(GetCurrentTimePoint, GetNextTimePoint, GetCurrentTimePointFraction);
	sp.SetRenderFunc(render);
	sp.Init();
	sp.SetParentStreamlinesRemovedFunc(
		function (index) {
			StreamlinesPlanes.splice(index, 1);
			for (var i = 0; i < StreamlinesPlanes.length; i++) {
				StreamlinesPlanes[i].Index = i;
			}
		}
	);
	StreamlinesPlanes.push(sp);

	if (Options.Tools.ShowFlowChart) {
		CreateFlowChart();
	}
}

var ParticleSystems = [];

function AddParticles() {
	if (!HasVelocity) {
		alert("Please load Velocity Data first");
		return;
	}

	var position = new THREE.Vector3(VolumeSizeX / 2, VolumeSizeY / 2, VolumeSizeZ / 2);
	var sp = new ParticleSystem(ParticleSystems.length, MainCanvas, Renderer, Camera, Scene, Controls, position, VolumeScale, MaxVelocity);
	sp.SetSpeedGetters(GetSpeedX, GetSpeedY, GetSpeedZ);
	sp.SetTimePointInfoGetters(GetCurrentTimePoint, GetNextTimePoint, GetCurrentTimePointFraction);
	sp.SetRenderFunc(render);
	sp.GetAnimationSpeed = function () { return Options.Render.speed; }
	sp.Init();
	sp.SetParentParticlesRemovedFunc(
		function (index) {
			ParticleSystems.splice(index, 1);
			for (var i = 0; i < ParticleSystems.length; i++) {
				ParticleSystems[i].Index = i;
			}
		}
	);
	ParticleSystems.push(sp);
}


var linesMesh;
var positions0;
var positions1;
var colors0;
var colors1;

var particleCount;
var particlesXSize;
var particlesYSize;
var particlesZSize;
var xRatio;
var yRatio;
var zRatio;
function AddSpeedField() {
	if (!HasVelocity) {
		alert("Please load Velocity Data first");
		return;
	}

	var targetParticleCount = 100000;
	var particlesPerSide = Math.pow(targetParticleCount, 1 / 3);
	var maxSideSize = Math.max(VolumeSizeX, Math.max(VolumeSizeY, VolumeSizeZ));
	particlesXSize = Math.floor(VolumeSizeX / maxSideSize * particlesPerSide);
	particlesYSize = Math.floor(VolumeSizeY / maxSideSize * particlesPerSide);
	particlesZSize = Math.floor(VolumeSizeZ / maxSideSize * particlesPerSide);
	particleCount = particlesXSize * particlesYSize * particlesZSize;
	xRatio = VolumeScale.x * VolumeSizeX / particlesXSize;
	yRatio = VolumeScale.y * VolumeSizeY / particlesYSize;
	zRatio = VolumeScale.z * VolumeSizeZ / particlesZSize;

	//lines
	var geometry = new THREE.BufferGeometry();
	positions0 = new Float32Array(particleCount * 3 * 2);
	positions1 = new Float32Array(particleCount * 3 * 2);
	colors0 = new Float32Array(particleCount * 3 * 2);
	colors1 = new Float32Array(particleCount * 3 * 2);
	InitSpeedField();

	geometry.setAttribute('position', new THREE.BufferAttribute(positions0, 3).setUsage(THREE.DynamicDrawUsage));
	geometry.setAttribute('position1', new THREE.BufferAttribute(positions1, 3).setUsage(THREE.DynamicDrawUsage));
	geometry.setAttribute('color0', new THREE.BufferAttribute(colors0, 3).setUsage(THREE.DynamicDrawUsage));
	geometry.setAttribute('color1', new THREE.BufferAttribute(colors1, 3).setUsage(THREE.DynamicDrawUsage));

	var shader = SpeedFieldShader;
	var uniforms = THREE.UniformsUtils.clone(shader.uniforms);

	var material = new THREE.ShaderMaterial({
		uniforms: uniforms,
		vertexShader: shader.VertexShader.value,
		fragmentShader: shader.FragmentShader.value,
		transparent: true,
		depthTest: false,
		depthWrite: false
	});

	linesMesh = new THREE.LineSegments(geometry, material);
	linesMesh.frustumCulled = false; //important
	Scene.add(linesMesh);

}

function InitSpeedField() {
	var pos = 0;
	for (var i = 0; i < particlesXSize; i++) {
		for (var j = 0; j < particlesYSize; j++) {
			for (var k = 0; k < particlesZSize; k++) {
				let x = i * xRatio;
				let y = j * yRatio;
				let z = k * zRatio;

				let xPos = x * VolumeScale.x;
				let yPos = y * VolumeScale.y;
				let zPos = z * VolumeScale.z;

				positions0[pos + 0] = xPos;
				positions0[pos + 1] = yPos;
				positions0[pos + 2] = zPos;
				positions0[pos + 3] = xPos;
				positions0[pos + 4] = yPos;
				positions0[pos + 5] = zPos;

				positions1[pos + 0] = xPos;
				positions1[pos + 1] = yPos;
				positions1[pos + 2] = zPos;
				positions1[pos + 3] = xPos;
				positions1[pos + 4] = yPos;
				positions1[pos + 5] = zPos;

				pos += 6;

			}
		}
	}
}

function UpdateSpeedField() {
	if (!linesMesh) { return; }

	let dt1 = 0.6;
	let dt2 = 1.2;
	let dt3 = 5.0;
	let vecLength = 5.0;
	var speedVector1 = new THREE.Vector3();
	var speedVector2 = new THREE.Vector3();
	var color1 = new THREE.Color();
	var color2 = new THREE.Color();
	let pos = 0;

	for (var i = 0; i < particlesXSize; i++) {
		for (var j = 0; j < particlesYSize; j++) {
			for (var k = 0; k < particlesZSize; k++) {
				let x = i * xRatio;
				let y = j * yRatio;
				let z = k * zRatio;

				let xPos = x * VolumeScale.x;
				let yPos = y * VolumeScale.y;
				let zPos = z * VolumeScale.z;

				let xSpeed1 = -GetSpeedX(CurrentFrame, x, y, z);
				let ySpeed1 = -GetSpeedY(CurrentFrame, x, y, z);
				let zSpeed1 = GetSpeedZ(CurrentFrame, x, y, z);
				if (!xSpeed1) { xSpeed1 = 0; }
				if (!ySpeed1) { ySpeed1 = 0; }
				if (!zSpeed1) { zSpeed1 = 0; }

				let xSpeed2 = -GetSpeedX(GetNextFrame(CurrentFrame), x, y, z);
				let ySpeed2 = -GetSpeedY(GetNextFrame(CurrentFrame), x, y, z);
				let zSpeed2 = GetSpeedZ(GetNextFrame(CurrentFrame), x, y, z);
				if (!xSpeed2) { xSpeed2 = 0; }
				if (!ySpeed2) { ySpeed2 = 0; }
				if (!zSpeed2) { zSpeed2 = 0; }

				speedVector1.set(xSpeed1, ySpeed1, zSpeed1);
				var val1 = speedVector1.length() / MaxVelocity;
				color1.setHSL(val1, 1.0, 0.5);

				speedVector2.set(xSpeed2, ySpeed2, zSpeed2);
				var val2 = speedVector1.length() / MaxVelocity;
				color2.setHSL(val2, 1.0, 0.5);

				//1
				positions0[pos + 0] += dt1 * xSpeed1;
				positions0[pos + 1] += dt1 * ySpeed1;
				positions0[pos + 2] += dt1 * zSpeed1;
				positions0[pos + 3] += dt2 * xSpeed1;
				positions0[pos + 4] += dt2 * ySpeed1;
				positions0[pos + 5] += dt2 * zSpeed1;

				colors0[pos + 0] = color1.r;
				colors0[pos + 1] = color1.g;
				colors0[pos + 2] = color1.b;
				colors0[pos + 3] = color1.r;
				colors0[pos + 4] = color1.g;
				colors0[pos + 5] = color1.b;

				//2
				positions1[pos + 0] += dt1 * xSpeed2;
				positions1[pos + 1] += dt1 * ySpeed2;
				positions1[pos + 2] += dt1 * zSpeed2;
				positions1[pos + 3] += dt2 * xSpeed2;
				positions1[pos + 4] += dt2 * ySpeed2;
				positions1[pos + 5] += dt2 * zSpeed2;

				colors1[pos + 0] = color2.r;
				colors1[pos + 1] = color2.g;
				colors1[pos + 2] = color2.b;
				colors1[pos + 3] = color2.r;
				colors1[pos + 4] = color2.g;
				colors1[pos + 5] = color2.b;

				pos += 6;
			}
		}
	}

	linesMesh.geometry.attributes.position.needsUpdate = true;
	linesMesh.geometry.attributes.position1.needsUpdate = true;
	linesMesh.geometry.attributes.color0.needsUpdate = true;
	linesMesh.geometry.attributes.color1.needsUpdate = true;
}

function GetSpeedX(timepoint, x, y, z) { return SpeedXSequence.Volumes[timepoint].getDataAtPoint(x, y, z); }
function GetSpeedY(timepoint, x, y, z) { return SpeedYSequence.Volumes[timepoint].getDataAtPoint(x, y, z); }
function GetSpeedZ(timepoint, x, y, z) { return SpeedZSequence.Volumes[timepoint].getDataAtPoint(x, y, z); }
function GetCurrentTimePoint() { return CurrentFrame; }
function GetNextTimePoint() { return GetNextFrame(CurrentFrame); }
function GetCurrentTimePointFraction() { return CurrentTime; }

function OnOrientationCubeVisibilityChange() {
	if (Options.Tools.ShowOrientationCube) {
		if (!Cube) {
			Cube = new OrientationCube(Camera, Controls);
		}

		document.getElementById("OrientationCubeContainer").style.display = "block";
	}
	else {
		document.getElementById("OrientationCubeContainer").style.display = "none";
	}
}

function SetBackground() {
	document.body.style.height = MainCanvas.clientHeight + 'px';
	let backgroundStyle = Options.View.GradientStyle === 'radial' ?
		'radial-gradient(closest-corner, ' + Options.View.Color1 + ',' + Options.View.Color2 + ')' :
		'linear-gradient(' + Options.View.GradientStyle + ',' + Options.View.Color1 + ',' + Options.View.Color2 + ')';
	document.body.style.background = backgroundStyle;
}

function OnFlowChartVisibilityChange() {
	if (Options.Tools.ShowFlowChart) {
		if (!FlowChart) {
			CreateFlowChart();
		}

		document.getElementById("FlowChart").style.display = "block";
	}
	else {
		document.getElementById("FlowChart").style.display = "none";
	}

	if (FlowChart) {
		ClearFlowChartData();
	}
}

var FlowChart;
function CreateFlowChart() {
	if (FlowChart) {
		Plotly.purge('FlowChart');
	}

	FlowChartY = 0;
	var numberOfSeries = StreamlinesPlanes ? StreamlinesPlanes.length : 0;

	var data = [];
	for (var i = 0; i < numberOfSeries; i++) {
		data.push({ type: 'line', y: [] });
	}

	const layout =
	{
		paper_bgcolor: '#ccc',
		plot_bgcolor: '#aaa',
		autosize: true,
		margin: { l: 0, t: 0, r: 0, b: 0 },
		yaxis: { automargin: true },
		xaxis: { automargin: true },
		showlegend: true,
		legend: { orientation: 'h' }
	}

	const config = { responsive: false }

	FlowChart = Plotly.newPlot('FlowChart', data, layout, config);
}

var FlowChartY = 0;
var FlowChartYRange = 500;

function NextFlowValue() {
	FlowChartY++;
	if (FlowChartY > FlowChartYRange) {
		Plotly.relayout('FlowChart',
			{
				xaxis:
				{
					range: [FlowChartY - FlowChartYRange, FlowChartY]
				}
			});
	}
}

function ClearFlowChartData() {
	Plotly.restyle('FlowChart', 'y', [[]]);
	FlowChartY = 0;
	Plotly.relayout('FlowChart',
		{
			xaxis:
			{
				range: [0, 500]
			}
		});
}

var ObjectTransformControls;

function AttachTransformControls(obj, onChange) {
	if (ObjectTransformControls) {
		Scene.remove(ObjectTransformControls);
		ObjectTransformControls.object = null;
		ObjectTransformControls.enabled = true;
		ObjectTransformControls.detach();
	}

	ObjectTransformControls = Utils.GetDefaultTransformControls(Camera, Renderer, Controls, obj, onChange);
	Scene.add(ObjectTransformControls);
	ShowInfo("W translate | E rotate | R scale");
}

function ShowInfo(message) {
	var info = document.getElementById('info');
	info.innerHTML = message;
	info.style.display = 'initial';
}

function HideInfo() {
	var info = document.getElementById('info');
	info.style.display = 'none';
}

window.ShowInfo = ShowInfo;
window.HideInfo = HideInfo;

function DetachTransformControls(obj) {
	if (ObjectTransformControls) {
		ObjectTransformControls.detach(obj);
		Scene.remove(ObjectTransformControls);
		HideInfo();
	}
}

var AreaOfInterest;

function ShowAreaOfInterest() {
	if (!AreaOfInterest) { CreateAreaOfInterest(); }

	if (Options.Render.ShowAreaOfInterest) {
		Scene.add(AreaOfInterest);

		AttachTransformControls(AreaOfInterest, OnAreaOfInterestPositionUpdate);
	}
	else {
		Scene.remove(AreaOfInterest);
		DetachTransformControls(AreaOfInterest);
	}
}

function OnAreaOfInterestUpdate() {
	Material.uniforms["u_AreaOfInterestAccentuator"].value = Options.Render.AreaOfInterestAccentuator;
	OnAreaOfInterestPositionUpdate();
}


function CreateAreaOfInterest() {
	var geometry = new THREE.SphereGeometry(1.0, 50, 50, 0, Math.PI * 2, 0, Math.PI * 2);
	AreaOfInterest = new THREE.Mesh(geometry);
	AreaOfInterest.position.x = VolumeSizeX / 2;
	AreaOfInterest.position.y = VolumeSizeY / 2;
	AreaOfInterest.position.z = VolumeSizeZ / 2;
	AreaOfInterest.scale.x = 0.3;
	AreaOfInterest.scale.y = 0.3;
	AreaOfInterest.scale.z = 0.3;
	AreaOfInterest.renderOrder = 3;
	AreaOfInterest.visible = false;
}

function OnAreaOfInterestPositionUpdate() {
	if (!AreaOfInterest) { CreateAreaOfInterest(); }

	Material.uniforms["u_AreaOfInterest"].value = new THREE.Vector3(AreaOfInterest.position.x / VolumeSizeX,
		AreaOfInterest.position.y / VolumeSizeY,
		AreaOfInterest.position.z / (1.5 * VolumeSizeZ));

	var radius = AreaOfInterest.scale.x;
	if (radius < 0.01) { radius = 0.01; }

	Material.uniforms["u_AreaOfInterestAxes"].value = new THREE.Vector3(AreaOfInterest.scale.x,
		AreaOfInterest.scale.y,
		AreaOfInterest.scale.z);
}

function updateUniforms() {
	Material.uniforms["u_ColorRange"].value.set(Options.Render.ColorRange1, Options.Render.ColorRange2);
	Material.uniforms["u_ISOThreshold"].value = Options.Render.ISOThreshold;
	Material.uniforms["u_MIPColorMap"].value = ColormapTextures[Options.Render.MIPColorMap];
	Material.uniforms["u_ISOColorMap"].value = ColormapTextures[Options.Render.ISOColorMap];
	Material.uniforms["u_SpeedColorMap"].value = ColormapTextures[Options.Render.SpeedColorMap];
	Material.uniforms["u_IsVisible"].value = Options.Render.isvisible;
	Material.uniforms["u_InterpolateFrame"].value = Options.Render.interpolateFrame;
	Material.uniforms["u_HasSpeedOverlay"].value = Options.Render.IsSpeedOverlayEnabled;

	Material.uniforms["u_MIPContribution"].value = Options.Render.MIPContribution;
	Material.uniforms["u_ISOContribution"].value = Options.Render.ISOContribution;
	Material.uniforms["u_SpeedContribution"].value = Options.Render.SpeedContribution;

	//render();
}

function UpdateVisibleRange() {
	Material.uniforms["u_XRangeStart"].value = Options.Render.XRangeStart;
	Material.uniforms["u_XRangeEnd"].value = Options.Render.XRangeEnd;
	Material.uniforms["u_YRangeStart"].value = Options.Render.YRangeStart;
	Material.uniforms["u_YRangeEnd"].value = Options.Render.YRangeEnd;
	Material.uniforms["u_ZRangeStart"].value = Options.Render.ZRangeStart;
	Material.uniforms["u_ZRangeEnd"].value = Options.Render.ZRangeEnd;
}

function UpdateResolution() {
	var w = MainCanvas.clientWidth;
	var h = MainCanvas.clientHeight;

	Renderer.setPixelRatio(window.devicePixelRatio * Options.Render.ResolutionFactor);
	Renderer.setSize(w, h);
}

function onWindowResize() {
	var w = MainCanvas.clientWidth;
	var h = MainCanvas.clientHeight;
	Renderer.setSize(w, h);
	var aspect = w / h;
	var frustumHeight = Camera.top - Camera.bottom;
	Camera.left = - frustumHeight * aspect / 2;
	Camera.right = frustumHeight * aspect / 2;
	Camera.updateProjectionMatrix();
	render();
}

function VideoOptionsChanged() { Options.Tools.VideoTotalFrames = parseInt(Options.Tools.VideoFramerate) * Options.Tools.VideoDuration; }

function TakeScreenshot() {
	if (Options.Tools.ImageUseCustomSize) { SetRendererSize(Options.Tools.ImageWidth, Options.Tools.ImageHeight); }

	var c = document.createElement('canvas');
	var ctx = c.getContext('2d');

	c.width = Options.Tools.ImageUseCustomSize ? Options.Tools.ImageWidth : MainCanvas.clientWidth;
	c.height = Options.Tools.ImageUseCustomSize ? Options.Tools.ImageHeight : MainCanvas.clientHeight;

	if (!Options.Tools.ImageTransparent) { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); }

	Renderer.render(Scene, Camera);
	ctx.drawImage(Renderer.domElement, 0, 0);

	c.toBlob(function (blob) {
		var a = document.createElement('a');
		var url = URL.createObjectURL(blob);
		a.href = url; a.download = 'screenshot.png'; a.click();
	}, 'image/png', 1.0);

	if (Options.Tools.ImageUseCustomSize) { SetRendererSize(MainCanvas.clientWidth, MainCanvas.clientHeight); }
}

var IsRecording = false;
var FramesRecorded = 0;
var Capturer;
function RecordVideo() {
	if (IsRecording) { return; }
	Capturer = new CCapture({ format: Options.Tools.VideoFormat, framerate: parseInt(Options.Tools.VideoFramerate), name: 'video' });
	CurrentTime = 0;
	FramesRecorded = 0;
	IsRecording = true;
	if (Options.Tools.VideoUseCustomSize) { SetRendererSize(Options.Tools.VideoWidth, Options.Tools.VideoHeight); }
	ShowLoading();
	Controls.enabled = false;
}

function StopRecording() {
	Capturer.stop();
	Capturer.save();
	Capturer = null;
	if (Options.Tools.VideoUseCustomSize) { SetRendererSize(MainCanvas.clientWidth, MainCanvas.clientHeight); }
	IsRecording = false;
	Controls.enabled = true;
	ShowLoading(false);
}

function SetRendererSize(width, height) {
	let aspect = height / width;

	let frustumSize = 5;
	Camera.left = frustumSize / - 2;
	Camera.right = frustumSize / 2;
	Camera.top = frustumSize * aspect / 2;
	Camera.bottom = - frustumSize * aspect / 2;

	Camera.updateProjectionMatrix();
	Renderer.setSize(width, height);
}

function ShowLoading(state = true) { document.getElementById('loading-wrapper').style.display = state ? 'initial' : 'none'; }
function HideLoading() { ShowLoading(false); }

function UpdateCheckbox(checkbox, newState) { checkbox.setValue(newState); checkbox.updateDisplay(); }