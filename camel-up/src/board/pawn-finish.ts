import * as T from 'three'
import { walnutImage } from './finishes'

// Silkscreen artwork for the saddle panel. The gold edge and its recessed shadow share one atlas.
function embroideredPanel() {
  const sheet = document.createElement('canvas')
  sheet.width = 512
  sheet.height = 512
  const ctx = sheet.getContext('2d')!
  const gold = '#e4b963',
    pale = '#ffdc96',
    copper = '#8d5b32'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const stroke = (points: number[][], color: string, width: number, close = false) => {
    ctx.beginPath()
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    if (close) ctx.closePath()
    ctx.lineWidth = width
    ctx.strokeStyle = color
    ctx.stroke()
  }
  for (const [offset, tone, weight] of [
    [7, copper, 8],
    [9, gold, 4],
    [24, gold, 2.5],
    [29, copper, 3],
    [33, pale, 2],
  ] as const) {
    ctx.lineWidth = weight
    ctx.strokeStyle = tone
    ctx.strokeRect(offset, offset, 512 - 2 * offset, 320 - 2 * offset)
  }
  for (let i = 0; i < 22; i++) {
    const cx = 19 + i * 22.6
    for (const y of [17, 303])
      stroke(
        [
          [cx - 7, y],
          [cx, y - 4],
          [cx + 7, y],
          [cx, y + 4],
        ],
        gold,
        2,
        true,
      )
  }
  for (let i = 0; i < 13; i++)
    for (const x of [17, 495]) {
      const cy = 24 + i * 22.6
      stroke(
        [
          [x - 4, cy],
          [x, cy - 7],
          [x + 4, cy],
          [x, cy + 7],
        ],
        gold,
        2,
        true,
      )
    }
  // Fan-shaped lotus petals are individually shaded against the dyed cloth.
  for (const cx of [95, 417]) {
    ctx.save()
    ctx.translate(cx, 237)
    for (let i = -3; i <= 3; i++) {
      ctx.save()
      ctx.rotate(i * 0.235)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.bezierCurveTo(-9, -19, -11, -43, 0, -66 + Math.abs(i) * 4)
      ctx.bezierCurveTo(11, -41, 9, -17, 0, 0)
      ctx.closePath()
      ctx.fillStyle = i % 2 ? gold : copper
      ctx.fill()
      ctx.strokeStyle = pale
      ctx.lineWidth = 2
      ctx.stroke()
      stroke(
        [
          [0, -4],
          [0, -47],
        ],
        copper,
        1.5,
      )
      ctx.restore()
    }
    stroke(
      [
        [-13, 0],
        [13, 0],
      ],
      pale,
      4,
    )
    ctx.restore()
  }
  for (const mirror of [-1, 1]) {
    ctx.save()
    ctx.translate(256, 0)
    ctx.scale(mirror, 1)
    for (let feather = 0; feather < 7; feather++) {
      const x = 9 + feather * 21,
        y = 90 - feather * 4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.bezierCurveTo(x + 14, y + 9, x + 34, y + 4, x + 58, y - 19)
      ctx.bezierCurveTo(x + 34, y - 10, x + 22, y - 11, x + 7, y - 7)
      ctx.closePath()
      ctx.fillStyle = feather % 2 ? copper : gold
      ctx.fill()
      ctx.strokeStyle = pale
      ctx.lineWidth = 2
      ctx.stroke()
    }
    for (const y of [142, 248])
      for (let i = 0; i < 3; i++) {
        const x = 57 + 22 * i
        stroke(
          [
            [x, y],
            [x + 7, y - 5],
            [x + 14, y],
            [x + 7, y + 5],
          ],
          gold,
          2,
          true,
        )
      }
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(256, 83, 13, 0, 2 * Math.PI)
  ctx.fillStyle = '#ac6238'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = pale
  ctx.stroke()
  // A separate collar motif shares the atlas. Paired leaves and little rosettes read at close range.
  for (const y of [358, 364, 476, 482])
    stroke(
      [
        [0, y],
        [512, y],
      ],
      y % 4 ? gold : pale,
      3,
    )
  for (let i = 0; i < 7; i++) {
    const cx = 7 + i * 76
    ctx.beginPath()
    ctx.moveTo(cx, 421)
    ctx.bezierCurveTo(cx + 23, 386, cx + 55, 386, cx + 76, 421)
    ctx.bezierCurveTo(cx + 53, 449, cx + 22, 449, cx, 421)
    ctx.strokeStyle = gold
    ctx.lineWidth = 5
    ctx.stroke()
    for (const dir of [-1, 1]) {
      stroke(
        [
          [cx + 18, 421],
          [cx + 32, 421 + dir * 13],
          [cx + 42, 421 + dir * 4],
          [cx + 49, 421 + dir * 11],
        ],
        pale,
        3,
      )
    }
    ctx.fillStyle = gold
    ctx.beginPath()
    ctx.arc(cx + 37, 421, 5, 0, 2 * Math.PI)
    ctx.fill()
  }
  const atlas = new T.CanvasTexture(sheet)
  atlas.colorSpace = T.SRGBColorSpace
  atlas.anisotropy = 4
  return atlas
}

export function finishCarvedPaint(material: T.MeshPhysicalMaterial, invalidate?: () => void) {
  material.roughness = 0.64
  material.clearcoat = 0.085
  material.clearcoatRoughness = 0.59
  const atlas = embroideredPanel()
  const neutral = document.createElement('canvas')
  neutral.width = 2
  neutral.height = 2
  const ctx = neutral.getContext('2d')!
  ctx.fillStyle = '#542d1c'
  ctx.fillRect(0, 0, 2, 2)
  const grain = new T.Texture<HTMLCanvasElement | HTMLImageElement>(neutral)
  grain.needsUpdate = true
  grain.wrapS = T.MirroredRepeatWrapping
  grain.wrapT = T.MirroredRepeatWrapping
  grain.anisotropy = 4
  let alive = true
  void walnutImage().then((im) => {
    if (alive && im) {
      grain.image = im
      grain.needsUpdate = true
      invalidate?.()
    }
  })
  material.addEventListener('dispose', () => {
    alive = false
    atlas.dispose()
    grain.dispose()
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pawnWood = { value: grain }
    shader.uniforms.saddleInk = { value: atlas }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      attribute float woodGrain;attribute vec2 inlayUv;
      varying vec3 carvingPosition;varying vec3 carvingNormal;
      varying float carvingWeight;varying vec2 embroideryUv;
    `,
      )
      .replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      carvingPosition=position;carvingNormal=normal;carvingWeight=woodGrain;embroideryUv=inlayUv;
    `,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      uniform sampler2D pawnWood;uniform sampler2D saddleInk;
      varying vec3 carvingPosition;varying vec3 carvingNormal;
      varying float carvingWeight;varying vec2 embroideryUv;
    `,
      )
      .replace(
        '#include <color_fragment>',
        `
      #include <color_fragment>
      vec3 cp=carvingPosition;
      float curve=sin(cp.x*7.3+cp.y*3.0)*.64+sin(cp.x*15.2-cp.z*4.1)*.16;
      vec2 woodUv=vec2(.18+cp.x*.56+cp.z*.18,.21+cp.y*.87+cp.z*.50+curve*.06);
      float longGrain=dot(texture2D(pawnWood,woodUv).rgb,vec3(.30,.55,.15));
      float endGrain=dot(texture2D(pawnWood,cp.zy*vec2(1.3,.84)+cp.xx*vec2(.14,.19)+.37).rgb,vec3(.30,.55,.15));
      float fiber=mix(longGrain,endGrain,smoothstep(.45,.93,abs(normalize(carvingNormal).x))*.78);
      float grainPhase=cp.y*86.0+cp.z*35.0+curve*4.1;
      float line=(pow(.5+.5*sin(grainPhase),4.)-.24)*(1.-smoothstep(.72,3.,fwidth(grainPhase)));
      float relief=clamp((fiber-.175)*3.15-line*.14,-.39,.43);
      diffuseColor.rgb*=1.+carvingWeight*relief;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.35,.19,.075),carvingWeight*max(0.,relief)*.20);
      if(embroideryUv.x>=0.0){
        vec2 stampUv=vec2(embroideryUv.x,embroideryUv.y<0.?mix(.305,.067,-embroideryUv.y):(.375+.625*embroideryUv.y));
        vec4 ink=texture2D(saddleInk,stampUv);
        diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,ink.a*.91);
        vec2 weave=embroideryUv*vec2(176.,221.);
        float threadVisibility=1.-smoothstep(1.,3.,max(fwidth(weave.x),fwidth(weave.y)));
        diffuseColor.rgb*=1.+threadVisibility*.03*sin(weave.x)*sin(weave.y);
      }
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `
      #include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+carvingWeight*(.045-relief*.13),.38,.90);
    `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
      #include <normal_fragment_maps>
      vec3 du=dFdx(-vViewPosition),dv=dFdy(-vViewPosition);
      vec3 woodX=cross(dv,normal),woodY=cross(normal,du);
      float woodDet=dot(du,woodX),carvedHeight=(fiber*.0034-line*.0005)*carvingWeight;
      normal=normalize(max(abs(woodDet),1e-10)*normal-sign(woodDet)*(dFdx(carvedHeight)*woodX+dFdy(carvedHeight)*woodY));
    `,
      )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      float paintEdge=1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.);
      outgoingLight+=carvingWeight*(diffuseColor.rgb*.12+paintEdge*paintEdge*(diffuseColor.rgb*.21+vec3(.035,.036,.037)));
      #include <opaque_fragment>
    `,
    )
  }
  material.customProgramCacheKey = () => 'carved-camel-paint-veneer-embroidery-v3'
  material.needsUpdate = true
}
