//Timur Vizaev 2020

const ParticleVertexShaderCode = `  

attribute vec3 color;
attribute float stoptime;

varying vec3 vColor;
varying float vStoptime;

uniform float u_PointSize;

void main() 
{

    vColor = color;
    vStoptime = stoptime;

    vec4 worldPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * worldPos;
    gl_PointSize = u_PointSize;
}
`

const ParticleFragmentShaderCode = `  

varying vec3 vColor;
varying float vStoptime;

uniform float u_Stoptime1;
uniform float u_Stoptime2;

void main() 
{
    if(vStoptime > u_Stoptime2) { discard; }

    float opacity = 1.0;
    if(vStoptime > u_Stoptime1) 
    { 
        opacity = (u_Stoptime2  - vStoptime) / (u_Stoptime2 - u_Stoptime1);
    }


    gl_FragColor = vec4(vColor, opacity);
}
`

var ParticleShader = {
	uniforms: {
		"u_Stoptime1": { value: 1.0 },
		"u_Stoptime2": { value: 4.0 },
		"u_PointSize": { value: 3.0 },
	},
	VertexShader: { value: ParticleVertexShaderCode },
	FragmentShader: { value: ParticleFragmentShaderCode }
};


export { ParticleShader };