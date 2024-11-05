//Timur Vizaev 2020

import { Vector2, Vector3 } from "./libs/three.module.js";

const VolumetricVertexShaderCode = `
varying vec4 v_nearpos;
varying vec4 v_farpos;
varying vec3 v_position;

uniform int u_IsVisible;

mat4 InverseMatrix(mat4 m) 
{
	float
	a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],
	a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],
	a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],
	a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],

	b00 = a00 * a11 - a01 * a10,
	b01 = a00 * a12 - a02 * a10,
	b02 = a00 * a13 - a03 * a10,
	b03 = a01 * a12 - a02 * a11,
	b04 = a01 * a13 - a03 * a11,
	b05 = a02 * a13 - a03 * a12,
	b06 = a20 * a31 - a21 * a30,
	b07 = a20 * a32 - a22 * a30,
	b08 = a20 * a33 - a23 * a30,
	b09 = a21 * a32 - a22 * a31,
	b10 = a21 * a33 - a23 * a31,
	b11 = a22 * a33 - a23 * a32,

	det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

	return mat4
	(
	a11 * b11 - a12 * b10 + a13 * b09,
	a02 * b10 - a01 * b11 - a03 * b09,
	a31 * b05 - a32 * b04 + a33 * b03,
	a22 * b04 - a21 * b05 - a23 * b03,
	a12 * b08 - a10 * b11 - a13 * b07,
	a00 * b11 - a02 * b08 + a03 * b07,
	a32 * b02 - a30 * b05 - a33 * b01,
	a20 * b05 - a22 * b02 + a23 * b01,
	a10 * b10 - a11 * b08 + a13 * b06,
	a01 * b08 - a00 * b10 - a03 * b06,
	a30 * b04 - a31 * b02 + a33 * b00,
	a21 * b02 - a20 * b04 - a23 * b00,
	a11 * b07 - a10 * b09 - a12 * b06,
	a00 * b09 - a01 * b07 + a02 * b06,
	a31 * b01 - a30 * b03 - a32 * b00,
	a20 * b03 - a21 * b01 + a22 * b00
	) / det;
}

void main() 
{
 	if(u_IsVisible == 0) { return; }
	// Prepare transforms to map to "camera view"
	mat4 viewtransformf = modelViewMatrix;
	mat4 viewtransformi = InverseMatrix(modelViewMatrix);

	// Project local vertex coordinate to camera position. Then do a step
	// backward (in cam coords) to the near clipping plane, and project back. Do
	// the same for the far clipping plane. This gives us all the information we
	// need to calculate the ray and truncate it to the viewing cone.
	vec4 position4 = vec4(position, 1.0);
	vec4 pos_in_cam = viewtransformf * position4;

	// Intersection of ray and near clipping plane (z = -1 in clip coords)
	pos_in_cam.z = -pos_in_cam.w;
	v_nearpos = viewtransformi * pos_in_cam;

	// Intersection of ray and far clipping plane (z = +1 in clip coords)
	pos_in_cam.z = pos_in_cam.w;
	v_farpos = viewtransformi * pos_in_cam;

	// Set varyings and output pos
	v_position = position;
	gl_Position = projectionMatrix * modelViewMatrix * position4;

}
`
const VolumetricFragmentShaderCode = `
precision highp float;
precision mediump sampler3D;

uniform vec3 u_VolumeSize;
uniform float u_ISOThreshold;
uniform vec2 u_ColorRange;
uniform float u_frameTransition;
uniform int u_IsVisible;
uniform int u_InterpolateFrame;

uniform sampler3D u_frame0;
uniform sampler3D u_frame1;

uniform sampler3D u_speed0;
uniform sampler3D u_speed1;
uniform int u_HasSpeedOverlay;

uniform sampler3D u_Mask;
uniform float u_MaskIntensity;
uniform int u_IsMaskEnabled;

uniform sampler2D u_MIPColorMap;
uniform sampler2D u_ISOColorMap;
uniform sampler2D u_SpeedColorMap;

uniform float u_XRangeStart;
uniform float u_XRangeEnd;
uniform float u_YRangeStart;
uniform float u_YRangeEnd;
uniform float u_ZRangeStart;
uniform float u_ZRangeEnd;

uniform float u_MIPContribution;
uniform float u_ISOContribution;
uniform float u_SpeedContribution;

uniform float u_AreaOfInterestAccentuator;
uniform float u_MIPSphereColorFactor;

varying vec3 v_position;
varying vec4 v_nearpos;
varying vec4 v_farpos;

uniform vec3 u_AreaOfInterest;
uniform vec3 u_AreaOfInterestAxes;

// The maximum distance through our rendering volume is sqrt(3).
const int MAX_STEPS = 381;	//381 for 256*256*116, 887 for 512^3, 1774 for 1024^3
const int REFINEMENT_STEPS = 4;
//const float relative_step_size = 1.0;
const float relative_step_size = 0.95;
const vec4 ambient_color = vec4(0.2, 0.4, 0.2, 1.0);
const vec4 diffuse_color = vec4(0.8, 0.2, 0.2, 1.0);
const vec4 specular_color = vec4(1.0, 1.0, 1.0, 1.0);
const float shininess = 40.0;

vec4 CastRay(vec3 start_loc, vec3 step, int nsteps, vec3 normalizedViewRay);

float Sample1(vec3 texcoords);
float Sample2(vec3 texcoords);
float SpeedSample1(vec3 texcoords);
float SpeedSample2(vec3 texcoords);
float MaskSample(vec3 texcoords);
float GetValue(vec3 texcoords);
float GetRateOfChange(vec3 texcoords);
vec4 AddLighting(float val, vec3 loc, vec3 step, vec3 normalizedViewRay);
vec3 GetNormal(vec3 loc, vec3 step, vec3 normalizedViewRay, out float val);

vec4 ApplyMIPColormap(float val) 
{
	val = (val - u_ColorRange[0]) / (u_ColorRange[1] - u_ColorRange[0]);
	vec4 color = texture2D(u_MIPColorMap, vec2(val, 0.5));
	color.a = pow(length(color.rgb), 0.3);
	return color;
}

vec4 ApplyISOColormap(float val) 
{
	val = (val - u_ColorRange[0]) / (u_ColorRange[1] - u_ColorRange[0]);
	//val *= 1.5;
	return texture2D(u_ISOColorMap, vec2(val, 0.5));
}

vec4 ApplySpeedColormap(float val) 
{
	//val = (val - u_ColorRange[0]) / (u_ColorRange[1] - u_ColorRange[0]);
	vec4 color = texture2D(u_SpeedColorMap, vec2(val, 0.5));
	color.a = pow(length(color.rgb), 0.3);
	return color;
}

void main() 
{
	if(u_IsVisible == 0) { discard; }
	
	// Normalize clipping plane info
	vec3 farpos = v_farpos.xyz / v_farpos.w;
	vec3 nearpos = v_nearpos.xyz / v_nearpos.w;

	// Calculate unit vector pointing in the view direction through this fragment.
	vec3 view_ray = normalize(nearpos - farpos);
	
	// Compute the (negative) distance to the front surface or near clipping plane.
	// v_position is the back face of the cuboid, so the initial distance calculated in the dot
	// product below is the distance from near clip plane to the back of the cuboid
	float distance = dot(nearpos - v_position, view_ray);
	distance = max(distance, min((-0.5 - v_position.x) / view_ray.x, (u_VolumeSize.x - 0.5 - v_position.x) / view_ray.x));
	distance = max(distance, min((-0.5 - v_position.y) / view_ray.y, (u_VolumeSize.y - 0.5 - v_position.y) / view_ray.y));
	distance = max(distance, min((-0.5 - v_position.z) / view_ray.z, (u_VolumeSize.z - 0.5 - v_position.z) / view_ray.z));
	
	// Now we have the starting position on the front surface
	vec3 front = v_position + view_ray * distance;
	
	// Decide how many steps to take
	int nsteps = int(-distance / relative_step_size + 0.5);
	if (nsteps < 1) { discard; }
	
	// Get starting location and step vector in texture coordinates
	vec3 step = ((v_position - front) / u_VolumeSize) / float(nsteps);
	vec3 start_loc = front / u_VolumeSize;

	gl_FragColor = CastRay(start_loc, step, nsteps, view_ray);

	//if (gl_FragColor.a < 0.05) { discard; }
}

bool IsInsideRange(vec3 coords)
{
	if(coords.x < u_XRangeStart || coords.x > u_XRangeEnd) { return false; }
	if(coords.y < u_YRangeStart || coords.y > u_YRangeEnd) { return false; }
	if(coords.z < u_ZRangeStart || coords.z > u_ZRangeEnd) { return false; }
	return true;
}

float Sample1(vec3 coords)
{
	if(!IsInsideRange(coords)) { return 0.0; }
	return texture(u_frame0, coords.xyz).r;
}

float Sample2(vec3 coords)
{
	if(!IsInsideRange(coords)) { return 0.0; }
	return texture(u_frame1, coords.xyz).r;
}

float SpeedSample1(vec3 coords)
{
	if(!IsInsideRange(coords)) { return 0.0; }
	return texture(u_speed0, coords.xyz).r;
}

float SpeedSample2(vec3 coords)
{
	if(!IsInsideRange(coords)) { return 0.0; }
	return texture(u_speed1, coords.xyz).r;
}

float MaskSample(vec3 coords)
{
	if(!IsInsideRange(coords)) { return 0.0; }
	return texture(u_Mask, coords.xyz).r;
}

float GetDepthPenaltyFrom(vec3 pos)
{
	float dist = sqrt(pow((pos.x - u_AreaOfInterest.x) / u_AreaOfInterestAxes.x, 2.0) +
	pow((pos.y - u_AreaOfInterest.y) / u_AreaOfInterestAxes.y, 2.0) +
	pow((pos.z - u_AreaOfInterest.z) / u_AreaOfInterestAxes.z, 2.0));

	float intensity = 1.3;
	float penalty = (1.0 - u_AreaOfInterestAccentuator) + intensity * u_AreaOfInterestAccentuator * (1.0 - dist);
	if(penalty < 0.0) { return 0.0; }
	return penalty;
}

float GetValue(vec3 coords)
{
	float mask = 1.0;
	if(u_IsMaskEnabled == 1)
	{
		float texValue = texture(u_Mask, coords.xyz).r;
		float m = 1.0 - texValue;
		mask = 1.0 - m * u_MaskIntensity;
	}
	float s1 = Sample1(coords.xyz);

	float s2 = s1;
	if(u_InterpolateFrame != 0)
	{
		s2 = Sample2(coords.xyz);
	}

	float value = mix(s1 * mask, s2 * mask, u_frameTransition);

	if(u_AreaOfInterestAccentuator > 0.0)
	{
		value *= GetDepthPenaltyFrom(coords);;
	}
	
	return value;
}

float GetSpeedValue(vec3 coords)
{
	float s1 = SpeedSample1(coords.xyz);
	float s2 = SpeedSample2(coords.xyz);

	float value = mix(s1, s2, u_frameTransition);

	if(u_AreaOfInterestAccentuator > 0.0)
	{
		value *= GetDepthPenaltyFrom(coords);
	}
	
	return value;
}


vec4 AddLighting(float val, vec3 loc, vec3 step, vec3 view_ray)
{
	//current coordinate overlay (demo):
	//return vec4(loc, 1.0);

	// Calculate color by incorporating lighting
	
	// View direction
	vec3 V = view_ray;
	
	vec3 N = GetNormal(loc, step, view_ray, val);
	float gm = length(N); // gradient magnitude
	//return vec4(loc.x + 0.1, 0.1, 0.1, 1.0);
	
	// Flip normal so it points towards viewer
	float Nselect = float(dot(N, V) > 0.0);
	N = (2.0 * Nselect - 1.0) * N;	// ==	Nselect * N - (1.0-Nselect)*N;
	
	// Init colors
	vec4 ambient_color = vec4(0.0, 0.0, 0.0, 0.0);
	vec4 diffuse_color = vec4(0.0, 0.0, 0.0, 0.0);
	vec4 specular_color = vec4(0.0, 0.0, 0.0, 0.0);
	
	for (int i = 0; i < 1; i++)
	{
		// Get light direction (make sure to prevent zero devision)
		vec3 L = view_ray;	//lightDirs[i];
		float lightEnabled = float( length(L) > 0.0 );
		L = normalize(L + (1.0 - lightEnabled));
	
		// Calculate lighting properties
		float lambertTerm = clamp(dot(N, L), 0.0, 1.0);
		vec3 H = normalize(L+V); // Halfway vector
		float specularTerm = pow(max(dot(H, N), 0.0), shininess);
	
		// Calculate mask
		float mask1 = lightEnabled;
	
		// Calculate colors
		ambient_color += mask1 * ambient_color;	// * gl_LightSource[i].ambient;
		diffuse_color += mask1 * lambertTerm;
		specular_color += mask1 * specularTerm * specular_color;
	}
	
	// Calculate final color by composing different components
	vec4 final_color;
	vec4 color = ApplyISOColormap(val);
	final_color = color * (ambient_color + diffuse_color) + specular_color;

	final_color.a = color.a;
	return final_color;
}

vec3 GetNormal(vec3 loc, vec3 step, vec3 normalizedViewRay, out float val)
{
	// calculate normal vector from gradient
	vec3 normal;
	float val1, val2;

	//loc = loc + step * normalizedViewRay;

	vec3 delta = vec3(step[0], 0.0, 0.0);
	val1 = GetValue(loc + delta);
	val2 = GetValue(loc - delta);
	normal[0] = val1 - val2;
	val = max(max(val1, val2), val);

	delta = vec3(0.0, step[1], 0.0);
	val1 = GetValue(loc + delta);
	val2 = GetValue(loc - delta);
	normal[1] = val1 - val2;
	val = max(max(val1, val2), val);

	delta = vec3(0.0, 0.0, step[2]);
	val1 = GetValue(loc + delta);
	val2 = GetValue(loc - delta);
	normal[2] = val1 - val2;
	val = max(max(val1, val2), val);

	return normalize(normal);
}

vec4 CastRay(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray)
{
	float max_val = 0.0;
	int max_i = 100;
	vec3 loc = start_loc;
	vec3 istep = step / float(REFINEMENT_STEPS);

	vec4 isoColor = vec4(0.0);	// init transparent
	vec3 dstep = 1.0 / u_VolumeSize;	// step to sample derivative
	float low_threshold = u_ISOThreshold - 0.02 * (u_ColorRange[1] - u_ColorRange[0]);
	bool isoComputed = false;

	float speed_max_val = 0.0;
	int max_i_speed = 100;
	for (int iter = 0; iter < MAX_STEPS; iter++) 
	{
		if (iter >= nsteps) { break; }

		float val = GetValue(loc);

		//MIP
		if (val > max_val) 
		{
			max_val = val;
			max_i = iter;
		}

		//SPEED
		float speedVal = GetSpeedValue(loc);
		if (speedVal > speed_max_val) 
		{
			speed_max_val = speedVal;
			max_i_speed = iter;
		}

		//ISO
		if (u_ISOContribution > 0.0 && !isoComputed && val > low_threshold) 
		{
			// Take the last interval in smaller steps
			vec3 iloc = loc - 0.5 * step;
			for (int i = 0; i < REFINEMENT_STEPS; i++) 
			{
				val = GetValue(iloc);
				if (val > u_ISOThreshold) 
				{
					isoColor = AddLighting(val, iloc, dstep, view_ray);
					isoComputed = true;
					break;
				}
				iloc += istep;
			}
		}
		// Advance location deeper into the volume
		loc += step;
	}

	// Refine location MIP
	vec3 refinedLocMip = start_loc + step * (float(max_i) - 0.5);
	for (int i = 0; i < REFINEMENT_STEPS; i++) 
	{
		vec3 refinedLoc = start_loc + step * (float(max_i) - 0.5) + float(i) * istep;
		float refinedValue = GetValue(refinedLoc);

		if(refinedValue > max_val)
		{
			max_val = refinedValue;
			refinedLocMip = refinedLoc;
		}
	}

	// Resolve final color
	vec4 mipColor = ApplyMIPColormap(max_val) ;
	vec4 speedColor = ApplySpeedColormap(speed_max_val);
	vec4 finalColor = u_MIPContribution * mipColor + u_ISOContribution * isoColor;

	float normalizator = u_MIPContribution + u_ISOContribution * 0.5; //0.5 for lighter colors if iso is applied
	if(u_HasSpeedOverlay != 0)
	{
		normalizator += u_SpeedContribution * 0.5; //0.5 for lighter colors
		finalColor += u_SpeedContribution * speedColor;
	}

	if(normalizator > 0.0)
	{
		finalColor.rgb = finalColor.rgb / normalizator;
	}

	return finalColor;
}
`

var VolumeRenderShader = {
	uniforms: {
		"u_VolumeSize": { value: new Vector3( 1, 1, 1 ) },
		"u_ISOThreshold": { value: 0.5 },
		"u_ColorRange": { value: new Vector2( 1, 1 ) },
		"u_frame0": { value: null },
		"u_frame1": { value: null },
		"u_speed0": { value: null },
		"u_speed1": { value: null },
		"u_HasSpeedOverlay": { value: 0 },
		"u_Mask": { value: null },
		"u_MaskIntensity": { value: 1.0 },
		"u_IsMaskEnabled": { value: 0 },
		"u_frameTransition": { value: 0.0 },
		"u_IsVisible": { value: 1 },
		"u_InterpolateFrame": { value: 1 },

		"u_XRangeStart": { value: 0.0 },
		"u_XRangeEnd": { value: 1.0 },
		"u_YRangeStart": { value: 0.0 },
		"u_YRangeEnd": { value: 1.0 },
		"u_ZRangeStart": { value: 0.0 },
		"u_ZRangeEnd": { value: 1.0 },

		"u_MIPContribution": { value: 1.0 },
		"u_ISOContribution": { value: 0.0 },
		"u_SpeedContribution": { value: 1.0 },

		"u_MIPSphereColorFactor": { value: 0.1 },

		"u_AreaOfInterest": { value: new Vector3( 0.5, 0.5, 0.5 ) },
		"u_AreaOfInterestAxes": { value: new Vector3( 0.5, 0.5, 0.5 ) },
		"u_AreaOfInterestAccentuator": { value: 0.0 },

		"u_MIPColorMap": { value: null },
		"u_ISOColorMap": { value: null },
		"u_SpeedColorMap": { value: null }

	},
	VertexShader: { value: VolumetricVertexShaderCode },
	FragmentShader: { value: VolumetricFragmentShaderCode }
};


export { VolumeRenderShader };