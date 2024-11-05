//Timur Vizaev 2020

const VertexShaderCode = `  

//attribute vec3 position;
attribute vec3 position1;

attribute vec3 color0;
attribute vec3 color1;

varying vec3 vColor0;
varying vec3 vColor1;

uniform float u_frameTransition;

void main() 
{
    vColor0 = color0;
    vColor1 = color1;

    vec4 worldPos = modelViewMatrix * vec4(mix(position, position1, u_frameTransition), 1.0);
    gl_Position = projectionMatrix * worldPos;
    //gl_PointSize = 1.0;
}
`

const FragmentShaderCode = `  

varying vec3 vColor0;
varying vec3 vColor1;

uniform float u_frameTransition;

void main() 
{
    float opacity = 1.0;
    gl_FragColor = vec4(mix(vColor0, vColor1, u_frameTransition), opacity);
}
`

var SpeedFieldShader = {
	uniforms: {
		"u_frameTransition": { value: 0.0 },
	},
	VertexShader: { value: VertexShaderCode },
	FragmentShader: { value: FragmentShaderCode }
};


export { SpeedFieldShader };