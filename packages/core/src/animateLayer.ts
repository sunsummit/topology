import { Store } from 'le5le-store';

import { Pen, PenType } from './models/pen';
import { Node } from './models/node';
import { Line } from './models/line';
import { TopologyData } from './models/data';
import { Options } from './options';
import { Layer } from './layer';
import { s8 } from './utils';

export class AnimateLayer extends Layer {
  protected data: TopologyData;
  pens = new Map();

  private timer: any;
  private lastNow = 0;
  private subscribeUpdate: any;
  private subscribePlay: any;
  constructor(public options: Options = {}, TID: String) {
    super(TID);
    this.data = Store.get(this.generateStoreKey('topology-data'));
    Store.set(this.generateStoreKey('LT:AnimateLayer'), this);

    if (!this.options.animateColor) {
      this.options.animateColor = '#ff6600';
    }

    this.subscribeUpdate = Store.subscribe(this.generateStoreKey('LT:updateLines'), (lines: Line[]) => {
      this.updateLines(lines);
    });
    this.subscribePlay = Store.subscribe(this.generateStoreKey('LT:AnimatePlay'), (params: { tag: string; pen: Pen; }) => {
      this.readyPlay(params.tag, false);
      this.animate();
    });
  }

  getAnimateLine(item: Pen) {
    const l = new Line(item);
    l.data = l.id;
    l.id = s8();
    l.setTID(this.TID);
    l.isAnimate = true;
    l.toArrow = '';
    if (l.fromArrow && l.fromArrow.indexOf('line') < 0) {
      l.animateFromSize = l.fromArrowSize + l.lineWidth * 5;
    }
    if (l.toArrow && l.toArrow.indexOf('line') < 0) {
      l.animateToSize = l.toArrowSize + l.lineWidth * 5;
    }
    l.animateStart = item.animateStart;
    l.lineCap = 'round';
    l.fillStyle = '#fff';
    l.strokeStyle = l.animateColor || this.options.animateColor;
    l.length = l.getLen();
    if (!l.fromArrowColor) {
      l.fromArrowColor = l.strokeStyle || '#222';
    }
    if (!l.toArrowColor) {
      l.toArrowColor = l.strokeStyle || '#222';
    }

    return l;
  }

  findLine(pen: Pen) {
    for (const item of this.data.pens) {
      if (item.id === pen.data) {
        return item;
      }
    }
  }

  readyPlay(tag?: string, auto?: boolean, pens?: Pen[]) {
    const readyPens = new Map();
    if (!pens) {
      pens = this.data.pens;
    }

    pens.forEach((pen: Pen) => {
      pen.setTID(this.TID);
      if (!pen.visible || readyPens.get(pen.id)) {
        return;
      }

      if ((auto && pen.animatePlay) || (tag && pen.tags.indexOf(tag) > -1)) {
        if (!pen.animateStart || pen.animateStart < 1) {
          pen.animateStart = Date.now();
        }
      }

      if (pen instanceof Node) {
        if (pen.animateStart > 0) {
          pen.initAnimateProps();
          readyPens.set(pen.id, pen);
        }
        if (pen.children && pen.children.length) {
          this.readyPlay(tag, auto, pen.children);
        }
      } else {
        if (pen.animateStart > 0) {
          readyPens.set(pen.id, this.getAnimateLine(pen));
        }

      }
    });

    readyPens.forEach((pen: Pen) => {
      if (pen.type) {
        this.pens.set(pen.data, pen);
      } else {
        this.pens.set(pen.id, pen);
      }
    });
  }

  animate() {
    if (this.timer) {
      cancelAnimationFrame(this.timer);
    }

    this.timer = requestAnimationFrame(() => {
      const now = Date.now();
      if (now - this.lastNow < 30) {
        this.animate();
        return;
      }
      this.lastNow = now;
      let animated = false;
      this.pens.forEach((pen: Pen) => {
        if (!pen.animateStart || pen.animateStart < 1) {
          if (pen.type) {
            this.pens.delete(pen.data);
          } else {
            this.pens.delete(pen.id);
          }
          return;
        }

        if (pen.animateStart > now) {
          return;
        }

        if (pen.animateFn) {
          if (typeof pen.animateFn === 'function') {
            pen.animateFn();
          } else if ((window as any)[pen.animateFn]) {
            (window as any)[pen.animateFn]();
          } else {
            // pen.render();
          }
        } else {
          pen.animate(now);
        }
        if (pen.animateStart < 1) {
          if (pen.type) {
            this.pens.delete(pen.data);
          } else {
            this.pens.delete(pen.id);
          }
          if (pen.type === PenType.Line) {
            const line = this.findLine(pen);
            line && (line.animateStart = 0);
          }
          if (pen.nextAnimate) {
            this.readyPlay(pen.nextAnimate, false);
          }
        }
        animated = true;
      });

      if (animated) {
        Store.set(this.generateStoreKey('LT:render'), true);
        this.animate();
      }
    });
  }

  updateLines(lines: Line[]) {
    this.pens.forEach((line: Pen, key) => {
      if (!(line instanceof Line)) {
        return;
      }

      for (const item of lines) {
        if (line.id === item.id) {
          line.from = item.from;
          line.to = item.to;
          line.controlPoints = item.controlPoints;
          line.length = line.getLen();
        }
      }
    });
  }

  render(ctx: CanvasRenderingContext2D) {
    this.pens.forEach((line: Pen, key) => {
      if (line.visible && line instanceof Line) {
        if (!line.getTID()) {
          line.setTID(this.TID);
        }
        line.render(ctx);
      }
    });
  }

  stop() {
    this.pens.clear();
    if (this.timer) {
      cancelAnimationFrame(this.timer);
    }
  }

  destroy() {
    this.stop();
    this.subscribeUpdate.unsubscribe();
    this.subscribePlay.unsubscribe();
  }
}
