import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {continents} from './geo.js';

const R = 6378.137;
const vector = p => new THREE.Vector3(p[0]/R, p[2]/R, -p[1]/R);

function earthTexture(){
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;
 const c=canvas.getContext('2d');c.fillStyle='#072744';c.fillRect(0,0,2048,1024);
 const gradient=c.createLinearGradient(0,0,0,1024);gradient.addColorStop(0,'#c0e0e5');gradient.addColorStop(.08,'#16455c');gradient.addColorStop(.5,'#082d51');gradient.addColorStop(.92,'#16455c');gradient.addColorStop(1,'#d0e2e5');c.fillStyle=gradient;c.fillRect(0,0,2048,1024);
 for(const land of continents){c.beginPath();land.forEach(([lo,la],i)=>{const x=(lo+180)/360*2048,y=(90-la)/180*1024;i?c.lineTo(x,y):c.moveTo(x,y)});c.closePath();c.fillStyle='#387c79';c.fill();c.strokeStyle='#78b8a5';c.lineWidth=2;c.stroke();}
 c.fillStyle='#a0c5c8';c.fillRect(0,963,2048,61);
 c.strokeStyle='#71a8bb20';c.lineWidth=1;for(let x=0;x<=2048;x+=2048/24){c.beginPath();c.moveTo(x,0);c.lineTo(x,1024);c.stroke()}for(let y=0;y<=1024;y+=1024/12){c.beginPath();c.moveTo(0,y);c.lineTo(2048,y);c.stroke()}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

export class MissionScene{
 constructor(canvas){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0x030911,0);
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(38,1,.01,100);
  this.camera.position.set(2.9,1.65,3.1);this.controls=new OrbitControls(this.camera,canvas);
  this.controls.enableDamping=true;this.controls.minDistance=1.5;this.controls.maxDistance=8;this.controls.enablePan=false;
  this.scene.add(new THREE.AmbientLight(0x658eae,1.5));const sun=new THREE.DirectionalLight(0xd8f3ff,3.5);sun.position.set(5,3,4);this.scene.add(sun);
  this.earth=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.MeshPhongMaterial({map:earthTexture(),shininess:24,specular:0x346e8e}));this.scene.add(this.earth);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.025,64,48),new THREE.ShaderMaterial({
   transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false,
   vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
   fragmentShader:'varying vec3 n; varying vec3 v; void main(){float a=pow(1.-abs(dot(normalize(n),normalize(v))),3.);gl_FragColor=vec4(.08,.48,.95,a*.65);}'
  }));this.scene.add(atmosphere);
  this.satellite=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(.023,.023,.035),new THREE.MeshStandardMaterial({color:0xffce83,metalness:.7,roughness:.25}));this.satellite.add(body);
  for(const sign of [-1,1]){const panel=new THREE.Mesh(new THREE.BoxGeometry(.055,.003,.028),new THREE.MeshStandardMaterial({color:0x258bd8,metalness:.6,roughness:.4}));panel.position.x=sign*.043;this.satellite.add(panel)}
  const marker=new THREE.Mesh(new THREE.SphereGeometry(.009,12,8),new THREE.MeshBasicMaterial({color:0x9cffff}));marker.position.y=.024;this.satellite.add(marker);this.scene.add(this.satellite);
  const positions=[];for(let i=0;i<1600;i++){const u=Math.sin(i*127.1)*43758.5453%1,v=Math.sin(i*311.7)*96321.912%1;const theta=u*Math.PI*2,z=v;const r=Math.sqrt(1-z*z);positions.push(30*r*Math.cos(theta),30*z,30*r*Math.sin(theta))}
  const stars=new THREE.BufferGeometry();stars.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0x97b8d9,size:.025,transparent:true,opacity:.6})));
  this.orbit=null;this.pathKey='';this.follow=false;this.ready=true;this.frameCount=0;
  this.resize();new ResizeObserver(()=>this.resize()).observe(canvas);
 }
 resize(){const r=this.renderer.domElement.getBoundingClientRect();if(r.width&&r.height){this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix()}}
 setPath(points){const key=JSON.stringify(points);if(key===this.pathKey)return;this.pathKey=key;if(this.orbit){this.scene.remove(this.orbit);this.orbit.geometry.dispose();this.orbit.material.dispose()}
  const geometry=new THREE.BufferGeometry().setFromPoints(points.map(vector));this.orbit=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x54e9de,transparent:true,opacity:.8}));this.scene.add(this.orbit);
 }
 render(sample){
  if(sample){const p=vector(sample.position_eci_km);this.satellite.position.copy(p);this.satellite.lookAt(new THREE.Vector3().addVectors(p,vector(sample.velocity_eci_kms)));this.earth.rotation.y=7.2921159e-5*sample.t_s;
   if(this.follow)this.controls.target.lerp(p,.1);else this.controls.target.lerp(new THREE.Vector3(),.1);
  }
  this.controls.update();this.renderer.render(this.scene,this.camera);this.frameCount++;
 }
 reset(){this.follow=false;this.camera.position.set(2.9,1.65,3.1);this.controls.target.set(0,0,0)}
}
