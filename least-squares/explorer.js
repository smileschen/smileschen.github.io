'use strict';
function calculate(points, intercept, slope) {
  const rows = points.map(([x,y]) => {
    const fitted=intercept+slope*x, residual=y-fitted;
    return {x,y,fitted,residual,square:residual*residual};
  });
  return {rows,sse:rows.reduce((sum,row)=>sum+row.square,0)};
}
function leastSquares(points) {
  if (points.length<2) return null;
  const n=points.length;
  const mx=points.reduce((s,p)=>s+p[0]/n,0);
  const my=points.reduce((s,p)=>s+p[1]/n,0);
  let xx=0,xy=0;
  for(const [x,y] of points) {xx+=(x-mx)**2;xy+=(x-mx)*(y-my);}
  if(!(xx>0)||!Number.isFinite(xx)||!Number.isFinite(xy)||points.every(p=>p[0]===points[0][0])) return null;
  const slope=xy/xx,intercept=my-slope*mx;
  const sse=calculate(points,intercept,slope).sse;
  if (![intercept,slope,sse].every(Number.isFinite)) return null;
  return {intercept,slope,sse};
}
function squareBounds(row) {
  const side=Math.abs(row.residual);
  return {x0:row.residual>0?row.x-side:row.x,
          x1:row.residual<0?row.x+side:row.x,
          y0:Math.min(row.y,row.fitted),y1:Math.max(row.y,row.fitted)};
}

const $ = id => document.getElementById(id);
const defaults = [[1,2],[2,6],[3,4],[4,8]];
const colors = {line:'#17629e', data:'#183047', positive:'#147269', negative:'#a94727'};
let params = {intercept:0,slope:1};
let submitted = null, revealed = false, frame = 0;
let plotBusy = false, plotPending = false;

function format(value, digits=3) {
  if (!Number.isFinite(value)) return '—';
  if (value===0) return '0';
  if (Math.abs(value)>=1e7 || Math.abs(value)<10**(-digits)) return value.toExponential(Math.min(digits,5));
  return Number(value.toFixed(digits)).toString();
}

function equation(intercept,slope) {
  return 'ŷ = '+format(intercept,4)+(slope<0?' − ':' + ')+format(Math.abs(slope),4)+'x';
}

function updateRowLabels() {
  Array.from($('data-rows').rows).forEach((row,i)=>{
    row.querySelector('[data-col="x"]').setAttribute('aria-label','x, row '+(i+1));
    row.querySelector('[data-col="y"]').setAttribute('aria-label','y, row '+(i+1));
    row.querySelector('button').setAttribute('aria-label','Remove row '+(i+1));
  });
}

function appendRow(x='',y='') {
  const tr = document.createElement('tr');
  for (const [name,value] of [['x',x],['y',y]]) {
    const input = document.createElement('input');
    input.type='number'; input.step='any'; input.value=value; input.dataset.col=name;
    input.addEventListener('input',onDataChange);
    tr.insertCell().append(input);
  }
  const remove = document.createElement('button');
  remove.type='button'; remove.className='remove'; remove.textContent='×';
  remove.addEventListener('click',()=>{tr.remove(); updateRowLabels(); onDataChange();});
  tr.insertCell().append(remove);
  $('data-rows').append(tr);
  updateRowLabels();
  return tr;
}

function readData() {
  const points=[];
  let incomplete=false;
  for (const row of $('data-rows').rows) {
    const x=row.cells[0].firstElementChild, y=row.cells[1].firstElementChild;
    if (x.validity.badInput||y.validity.badInput) {incomplete=true;continue;}
    if (x.value===''&&y.value==='') continue;
    if (x.value===''||y.value===''||!Number.isFinite(x.valueAsNumber)||!Number.isFinite(y.valueAsNumber)) {
      incomplete=true;continue;
    }
    points.push([x.valueAsNumber,y.valueAsNumber]);
  }
  return {points,incomplete};
}

function onDataChange() {
  submitted=null; revealed=false;
  $('submission').hidden=true;
  $('solution').hidden=true;
  queueRender();
}

function syncParam(name, value, preserveInput=false) {
  if (!Number.isFinite(value)) return;
  params[name]=Object.is(value,-0)?0:value;
  const slider=$(name+'-slider');
  // Keep the original +/-10 range for typical examples; expand for typed values.
  if (value<Number(slider.min)||value>Number(slider.max)) {
    const extent=Math.max(10,Math.ceil(Math.abs(value)*1.25));
    slider.min=-extent;slider.max=extent;
  }
  slider.value=params[name];
  if (!preserveInput) $(name+'-value').value=params[name];
  queueRender();
}

for (const name of ['intercept','slope']) {
  const slider=$(name+'-slider'), input=$(name+'-value');
  slider.addEventListener('input',()=>syncParam(name,slider.valueAsNumber));
  input.addEventListener('input',()=>{if(Number.isFinite(input.valueAsNumber)) syncParam(name,input.valueAsNumber,true);});
  input.addEventListener('blur',()=>{input.value=params[name];});
  input.addEventListener('keydown',e=>{if(e.key==='Enter') input.blur();});
}
document.querySelectorAll('[data-param]').forEach(button=>{
  button.addEventListener('click',()=>{
    const name=button.dataset.param;
    syncParam(name,Number((params[name]+Number(button.dataset.delta)).toPrecision(12)));
  });
});

function current() {
  const {points,incomplete}=readData();
  const result=calculate(points,params.intercept,params.slope);
  const optimum=leastSquares(points);
  const finite=result.rows.every(r=>[r.fitted,r.residual,r.square].every(Number.isFinite))&&Number.isFinite(result.sse);
  return {points,incomplete,result,optimum,finite,valid:!incomplete&&finite&&optimum!==null};
}

function reset() {
  $('data-rows').replaceChildren();
  defaults.forEach(([x,y])=>appendRow(x,y));
  for(const name of ['intercept','slope']) {
    const slider=$(name+'-slider');slider.min=-10;slider.max=10;
    syncParam(name,name==='intercept'?0:1);
  }
  $('show-labels').checked=true;
  onDataChange();
}

$('add').addEventListener('click',()=>{appendRow().querySelector('input').focus();onDataChange();});
$('reset').addEventListener('click',reset);
$('show-labels').addEventListener('change',queueRender);
$('submit').addEventListener('click',()=>{
  const state=current();if(!state.valid) return;
  submitted={...params,sse:state.result.sse};
  $('submission').textContent='Submitted: '+equation(submitted.intercept,submitted.slope)+'; sum of squares = '+format(submitted.sse)+'.';
  $('submission').hidden=false;
  queueRender();
});
$('reveal').addEventListener('click',()=>{if(current().valid){revealed=true;queueRender();}});
$('apply').addEventListener('click',()=>{
  const state=current();if(!state.valid||!revealed) return;
  syncParam('intercept',state.optimum.intercept);
  syncParam('slope',state.optimum.slope);
});

function renderSolution(state) {
  $('solution').hidden=!revealed||!state.valid;
  if(!revealed||!state.valid) return;
  const opt=state.optimum;
  $('optimal-line').textContent=equation(opt.intercept,opt.slope);
  $('optimal-sse').textContent='Minimum sum of squares: '+format(opt.sse);
  if(!submitted) {
    $('comparison').textContent='No line was submitted. You can still compare your current sum of squares with the minimum.';
    return;
  }
  const excess=Math.max(0,submitted.sse-opt.sse);
  const tolerance=1e-10*Math.max(Number.MIN_VALUE,submitted.sse,opt.sse);
  let message='Your submitted sum of squares was '+format(submitted.sse)+'. ';
  if(excess<=tolerance) message+='You reached the minimum (within numerical precision)!';
  else if(opt.sse===0) message+='It is '+format(excess)+' above the minimum of zero. A percentage comparison is undefined.';
  else message+='It is '+format(excess)+' above the minimum ('+format(100*excess/opt.sse,2)+'% higher).';
  $('comparison').textContent=message;
}

function plotSpec(rows) {
  let xlo=Infinity,xhi=-Infinity,ylo=Infinity,yhi=-Infinity;
  const shapes=[],annotations=[],resX=[],resY=[];
  const labels=$('show-labels').checked;
  for(const row of rows) {
    const b=squareBounds(row);
    xlo=Math.min(xlo,b.x0);xhi=Math.max(xhi,b.x1);
    ylo=Math.min(ylo,b.y0);yhi=Math.max(yhi,b.y1);
    resX.push(row.x,row.x,null);resY.push(row.fitted,row.y,null);
    if(row.residual!==0) {
      const color=row.residual>0?colors.positive:colors.negative;
      shapes.push({type:'rect',xref:'x',yref:'y',...b,layer:'below',
        line:{color,width:1.5},fillcolor:row.residual>0?'rgba(20,114,105,.14)':'rgba(169,71,39,.14)'});
    }
  }
  if(!rows.length) {xlo=-1;xhi=5;ylo=-1;yhi=9;}
  const xp=Math.max(0.75,(xhi-xlo)*.12),yp=Math.max(0.75,(yhi-ylo)*.12);
  const xr=[xlo-xp,xhi+xp],yr=[ylo-yp,yhi+yp];
  // Estimate the final visible units per pixel so very small squares get callouts.
  const plot=$('plot');
  const unitsPerPixel=Math.max((xr[1]-xr[0])/Math.max(180,plot.clientWidth-70),(yr[1]-yr[0])/Math.max(180,plot.clientHeight-120));
  if(labels) rows.forEach((row,i)=>{
    const b=squareBounds(row),side=Math.abs(row.residual);
    const color=row.residual>0?colors.positive:row.residual<0?colors.negative:colors.data;
    const inside=side/unitsPerPixel>75;
    const sideDir=row.residual>0?-1:1;
    annotations.push({
      x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2,
      text:'e = '+format(row.residual,2)+'<br>e² = '+format(row.square,2),
      showarrow:!inside,arrowhead:0,arrowcolor:color,
      ax:inside?0:sideDir*46,ay:inside?0:(i%2===0?-25:25),
      font:{size:11,color},bgcolor:'rgba(255,255,255,.88)',borderpad:2
    });
  });
  // Extend the fitted line across the axis even if scale anchoring expands x.
  const span=Math.max(xr[1]-xr[0],(yr[1]-yr[0])*Math.max(1,plot.clientWidth/Math.max(1,plot.clientHeight))*2);
  const center=xr[0]+(xr[1]-xr[0])/2;
  const lx=[center-span,center+span];
  const ly=lx.map(x=>params.intercept+params.slope*x);
  const x=rows.map(r=>r.x),y=rows.map(r=>r.y),fitted=rows.map(r=>r.fitted);
  const data=[
    {type:'scatter',mode:'lines',x:lx,y:ly,name:'Fitted line',line:{color:colors.line,width:3},hoverinfo:'skip'},
    {type:'scatter',mode:'lines',x:resX,y:resY,name:'Residual',line:{color:'#536b81',width:2,dash:'dot'},hoverinfo:'skip'},
    {type:'scatter',mode:'markers',x,y,name:'Data',marker:{size:10,color:colors.data,line:{color:'white',width:1}},
      customdata:rows.map(r=>[r.fitted,r.residual,r.square]),hovertemplate:'x=%{x}<br>y=%{y}<br>ŷ=%{customdata[0]:.4g}<br>e=%{customdata[1]:.4g}<br>e²=%{customdata[2]:.4g}<extra></extra>'},
    {type:'scatter',mode:'markers',x,y:fitted,name:'Predicted values',marker:{size:9,symbol:'x',color:colors.line},
      hovertemplate:'x=%{x}<br>ŷ=%{y:.4g}<extra></extra>'}
  ];
  return {data,layout:{
    autosize:true,margin:{l:53,r:15,t:16,b:105},paper_bgcolor:'#fff',plot_bgcolor:'#fff',
    font:{family:'Inter, Segoe UI, system-ui, sans-serif',color:colors.data,size:12},
    xaxis:{title:'x',range:xr,autorange:false,gridcolor:'#e5edf4',zerolinecolor:'#aabccd',constrain:'range'},
    yaxis:{title:'y',range:yr,autorange:false,gridcolor:'#e5edf4',zerolinecolor:'#aabccd',scaleanchor:'x',scaleratio:1,constrain:'range'},
    legend:{orientation:'h',x:0,y:-.18,xanchor:'left',yanchor:'top'},
    dragmode:'pan',shapes,annotations,hovermode:'closest'
  }};
}

function drawPlot(rows) {
  const plot=$('plot');
  if(!window.Plotly) {
    plot.textContent='The plotting library could not load. You can still use the controls and residual table.';
    return;
  }
  // Do not overlap asynchronous Plotly.react calls during rapid slider movements.
  if(plotBusy){plotPending=true;return;}
  plotBusy=true;
  const {data,layout}=plotSpec(rows);
  Promise.resolve(Plotly.react(plot,data,layout,{responsive:true,displaylogo:false,scrollZoom:false}))
    .catch(err=>{console.error(err);})
    .finally(()=>{plotBusy=false;if(plotPending){plotPending=false;queueRender();}});
}

function render() {
  const state=current(), {points,incomplete,result,optimum,finite}=state;
  let warning='';
  if(incomplete) warning='Complete both values in each row, or remove the incomplete row.';
  else if(points.length<2) warning='Enter at least two complete points.';
  else if(!optimum) warning='Enter at least two distinct x values to obtain a unique least-squares line.';
  if(!finite) warning='These values are too large to calculate reliably. Try smaller values.';
  $('data-warning').hidden=!warning;$('data-warning').textContent=warning;
  $('submit').disabled=!state.valid;$('reveal').disabled=!state.valid;
  $('equation').textContent=equation(params.intercept,params.slope);
  $('sse').textContent=points.length&&finite?format(result.sse):'—';
  const fragment=document.createDocumentFragment();
  for(const row of result.rows) {
    const tr=document.createElement('tr');
    for(const key of ['x','y','fitted','residual','square']) {
      const cell=tr.insertCell();cell.textContent=format(row[key]);
      if(key==='residual'&&row.residual!==0) cell.className=row.residual>0?'positive':'negative';
    }
    fragment.append(tr);
  }
  $('result-rows').replaceChildren(fragment);
  renderSolution(state);
  drawPlot(finite?result.rows:[]);
}

function queueRender() {
  if(frame) return;
  frame=requestAnimationFrame(()=>{frame=0;render();});
}

reset();
