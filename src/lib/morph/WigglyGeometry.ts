import {
  BufferGeometry,
  TetrahedronGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  LineCurve,
  Vector2,
  Vector3
} from 'three';
import { Movement } from './Movement';

const DEFAULT_TRANSITION_TIME = 2;

export class WigglyGeometry extends BufferGeometry {
  public parameters: {
    geometry: BufferGeometry;
    startTime: number;
    bufferSize: number;
    moves: Movement[];
    transitionMoves: Movement[];
    index: BufferAttribute | null;
  };
  public type = 'WigglyGeometry';
  public onTransition: boolean = false;
  public transitionTime: number;
  public vertices: number[] = [];

  private pausedTime: number = 0;
  private pausedTotal: number = 0;
  
  constructor({
    geometry, startTime, moves, transitionTime, bufferSize = 10000
  }: Readonly<{
    geometry: BufferGeometry;
    startTime: number;
    moves?: Movement[];
    transitionTime?: number;
    bufferSize?: number;
  }>) {
    super();

    const initialGeometry = new TetrahedronGeometry(0);
    const initialMoves = new Array(4).fill(new Movement().stationary());

    this.parameters = {
      geometry: initialGeometry,
      startTime: startTime,
      bufferSize: bufferSize,
      moves: initialMoves,
      transitionMoves: null as unknown as Movement[],
      index: null,
    };

    this.transitionTime = transitionTime ?? DEFAULT_TRANSITION_TIME;
    
    this.setGeometry(initialGeometry);
    this.transformTo(geometry, startTime, moves);

    // Maybe add support for groups in the future.
  }

  setGeometry(geometry: BufferGeometry) {
    const indexed = WigglyGeometry.toIndexed(geometry, this.parameters.bufferSize);
    this.setIndex(indexed.index);
    this.setAttribute('position', indexed.attributes.position);
    this.setDrawRange(0, indexed.drawRange.count);
    this.vertices = indexed.userData.vertices;
  }

  static toIndexed(geometry: BufferGeometry, bufferSize?: number): BufferGeometry {
    const result = new BufferGeometry();
    
    let vertices = [];
    const indices: number[] = [];
    const vertexSet = new Map<string, number>();
    const position = geometry.getAttribute('position');
    
    const hashVertex = (x: number, y: number, z: number) => `${x},${y},${z}`;
    for (let i = 0; i < position.count; i++) {
      const toTest = [position.getX(i), position.getY(i), position.getZ(i)];

      const hash = hashVertex(toTest[0], toTest[1], toTest[2]);
      if (vertexSet.has(hash)) {
        indices.push(vertexSet.get(hash) ?? vertices.length / 3 - 1);
      } else {
        indices.push(vertices.length / 3);
        vertexSet.set(hash, vertices.length / 3);
        vertices.push(...toTest);
      }
    }

    if (!!geometry.index) {
      const reduced: number[] = [];
      for (let i = 0; i < geometry.index.count; i++) {
        reduced.push(indices[geometry.index.array[i]]);
      }
      result.setIndex(reduced);
    } else {
      result.setIndex(indices);
    }

    result.userData.vertices = vertices;

    if (bufferSize) {
      const zeros = new Array(bufferSize * 3 - vertices.length).fill(0);
      vertices = vertices.concat(zeros);
    }
    result.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    result.setDrawRange(0, result.getIndex()?.count ?? Infinity);

    return result;
  }

  setMoves(moves?: Movement[]) {
    this.parameters.moves = [];
    for (let i = 0; i < this.vertices.length / 3; i++) {
      this.parameters.moves[i] = (moves && moves[i]) ? moves[i] : new Movement({ origin: this.getVertex(i) ?? new Vector3() }).stationary();
    }
  }

  transformTo(newGeometry: BufferGeometry, startTime: number, moves?: Movement[] | boolean, duration?: number) {
    const newIndexed = WigglyGeometry.toIndexed(newGeometry, this.parameters.bufferSize);
    const newPosition = newIndexed.attributes.position;
    const defaultTiming = new LineCurve(new Vector2(), new Vector2(duration ?? this.transitionTime, 1));

    const createTransition = (
      higher: number,
      sourceIndex: (i: number) => number,
      destIndex: (i: number) => number
    ): Movement[] => {
      const arr = [];
      for (let i = 0; i < higher; i++) {
        const source = this.getVertexCurrentPosition(sourceIndex(i)) ?? new Vector3();
        const dest = new Vector3(newPosition.getX(destIndex(i)), newPosition.getY(destIndex(i)), newPosition.getZ(destIndex(i)));
        arr.push(new Movement({origin: source, paths: [new Vector3(), dest.sub(source)], timings: [defaultTiming], loop: false }));
      }
      return arr;
    }

    const getTransitionParams = (moveCount: number, verticesCount: number) => {
      if (moveCount > verticesCount) {
        return {
          higher: moveCount,
          sourceIndex: (i: number) => i,
          destIndex: (i: number) => i % verticesCount,
        };
      } else {
        return {
          higher: verticesCount,
          sourceIndex: (i: number) => i % moveCount,
          destIndex: (i: number) => i,
        };
      }
    };
    
    this.vertices = newIndexed.userData.vertices;

    const params = this.onTransition
    ? getTransitionParams(this.parameters.transitionMoves.length, newIndexed.userData.vertices.length / 3)
    : getTransitionParams(this.parameters.moves.length, newIndexed.userData.vertices.length / 3);

    let movesToSet;
    if (typeof moves === 'boolean') {
      if (moves) {
        movesToSet = Array(this.vertices.length / 3).fill(0).map((_, i) => new Movement({ origin: this.getVertex(i) })); // if moves is true, pass random movements
      } else {
        movesToSet = undefined; // if moves is false, let setMoves to make all movements stationary
      }
    } else {
      movesToSet = moves; // if moves is not boolean, it is assumed to be Movement[] or undefined
    }
    this.setMoves(movesToSet);
    
    this.parameters.transitionMoves = createTransition(params.higher, params.sourceIndex, params.destIndex);
    this.parameters.index = newIndexed.index;

    this.setDrawRange(0, Math.max(newIndexed.index?.count ?? Infinity, this.index?.count ?? Infinity)); // should be fixed to have drawRange up to larger index count between current index and transforming geometry's index
    this.setIndex((newIndexed.index?.count ?? Infinity) > (this.index?.count ?? Infinity) ? newIndexed.index : this.index); // use larger index, fix later when the transform is over

    
    this.parameters.geometry = newGeometry;
    this.parameters.startTime = startTime;

    this.pausedTime = 0;
    this.pausedTotal = 0;
    
    this.onTransition = true;
  }

  getVertex(index: number): Vector3 | undefined {
    if (index < 0 || index >= this.vertices.length / 3) return undefined;
    return new Vector3(this.vertices[index * 3], this.vertices[index * 3 + 1], this.vertices[index * 3 + 2]);
  }

  getVertexCurrentPosition(index: number): Vector3 | undefined {
    const position = this.attributes.position;
    if (index < 0 || index >= position.count) return undefined;
    return new Vector3(position.getX(index), position.getY(index), position.getZ(index));
  }

  /**
   * Updates the vertices of the geometry based on the current time.
   * 
   * @param time - The current time (in seconds) used to calculate the vertex positions.
   * @param wiggle - A boolean indicating whether the vertices should wiggle. If changed to false, the vertex movements will pause and continue when changed back to true.
   */
  updateVertices(time: number, wiggle = true) {
    if (this.onTransition && this.parameters.startTime + this.transitionTime < time) {
      this.onTransition = false;


      this.setDrawRange(0, this.parameters.index?.count ?? Infinity); // Transition is over, fix index and drawRange to transformed geometry
      this.setIndex(this.parameters.index);
    }

    if (!wiggle) {
      // Pause the movements after transition is over
      if (this.pausedTime === 0 && !this.onTransition) {
        this.pausedTime = time;
      }
    } else if (this.pausedTime !== 0) {
      this.pausedTotal += time - this.pausedTime;
      this.pausedTime = 0;
    }

    const arr: number[] = [];

    const currentMove = this.onTransition ? this.parameters.transitionMoves : this.parameters.moves;
    const adjustedTime = time - this.parameters.startTime - (!this.onTransition ? this.transitionTime : 0) - this.pausedTotal - (this.pausedTime === 0 ? 0: time - this.pausedTime);

    // Update the vertices only if not paused
    if (this.pausedTime === 0) {
      for (let i = 0; i < currentMove.length; i++) {
        arr.push(...currentMove[i].getCurrentPoint(adjustedTime).toArray());
      }
    
      const zeros = new Array(this.parameters.bufferSize * 3 - arr.length).fill(0);
      const buffered = arr.concat(zeros);
      
      const positionAttribute = this.getAttribute('position') as Float32BufferAttribute;
      if (positionAttribute) {
        positionAttribute.array.set(buffered);
        positionAttribute.needsUpdate = true;
      } else {
        this.setAttribute('position', new Float32BufferAttribute(buffered, 3));
      }
    }
  }

  copy(source: WigglyGeometry) {
    super.copy(source);
    this.parameters = JSON.parse(JSON.stringify(source.parameters));

    return this;
  }
}