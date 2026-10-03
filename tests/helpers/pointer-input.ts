import type {Page,CDPSession} from '@playwright/test';

export type Position={x:number;y:number};
export class Touch {
  private points=new Map<number,Position>();
  constructor(private session:CDPSession){}
  private dispatch(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel'){
    return this.session.send('Input.dispatchTouchEvent',{type,touchPoints:[...this.points].map(([id,point])=>({...point,id,radiusX:8,radiusY:8,force:1}))});
  }
  async down(id:number,point:Position){this.points.set(id,point);await this.dispatch('touchStart');}
  async move(id:number,point:Position){this.points.set(id,point);await this.dispatch('touchMove');}
  async up(id:number){
    const point=this.points.get(id);if(!point)throw Error(`Touch ${id} is not active`);
    this.points.delete(id);
    // End the whole gesture with CDP's documented empty point list so the
    // browser's touch device is ready for Playwright's next native tap. Only
    // selective multi-finger release needs the legacy released-point form;
    // sending the remaining primary here would release the wrong finger.
    await this.session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:this.points.size?[{...point,id}]:[]});
  }
  async cancel(){this.points.clear();await this.dispatch('touchCancel');}
}
export async function tracePoints(page:Page,median:number[][]):Promise<Position[]>{
  await page.locator('.trace-grid').scrollIntoViewIfNeeded();
  return page.locator('.trace-grid').evaluate((element,points)=>{
    const svg=element as SVGSVGElement,matrix=svg.getScreenCTM()!;
    return points.map(([x,y])=>{const point=svg.createSVGPoint();point.x=x;point.y=900-y;const screen=point.matrixTransform(matrix);return{x:screen.x,y:screen.y};});
  },median);
}
export async function drag(page:Page,points:Position[],touch:Touch|null,steps=4){
  // A one-step edge probe deliberately jumps between waypoints instead of
  // brushing the newly entered surface. Match mouse.move({steps:1}) exactly.
  if(touch&&steps===1){await touch.down(1,points[0]);for(const point of points.slice(1))await touch.move(1,point);await touch.up(1);}
  else if(touch){
    const lengths=[0];
    for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)!+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
    const length=lengths.at(-1)!;
    // Sample a held finger on real browser frames and ease to a stop before
    // lifting. The final 100ms travels at most 1 CSS pixel, preventing an
    // unrealistically fast injected stroke from becoming a touchscreen fling.
    const duration=Math.max(600,100*Math.cbrt(length));
    const frame=()=>page.evaluate(()=>new Promise<number>(resolve=>requestAnimationFrame(resolve)));
    await touch.down(1,points[0]);
    const started=await frame();let nextVertex=1,travelled=0;
    while(travelled<length){
      const elapsed=Math.min(1,((await frame())-started)/duration);
      travelled=length*(1-(1-elapsed)**3);
      // Preserve every original turn and out-of-bounds waypoint even when a
      // frame crosses it, keeping cancellation and trace scoring unchanged.
      while(nextVertex<points.length&&lengths[nextVertex]<=travelled){await touch.move(1,points[nextVertex]);nextVertex++;}
      if(nextVertex<points.length){
        const from=points[nextVertex-1],to=points[nextVertex],span=lengths[nextVertex]-lengths[nextVertex-1];
        const fraction=span?(travelled-lengths[nextVertex-1])/span:0;
        await touch.move(1,{x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction});
      }
    }
    await touch.up(1);
  }
  else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const point of points.slice(1))await page.mouse.move(point.x,point.y,{steps});await page.mouse.up();}
}
