import type { RocolaFallbackEntry } from './rocola-content.types.js';

// Respaldo de emergencia: se usa solo si el lookup en vivo a iTunes falla
// por completo (sin red, timeout, error del servicio) — nunca como fuente
// primaria. preview/portada ya quedaron embebidos al momento de armar este
// banco (misma resolución que song-bank.ts); si con el tiempo dejan de
// andar, se resuelven de nuevo con el mismo script y se actualiza acá.
export const SONG_FALLBACK_BANK: RocolaFallbackEntry[] = [
  {
    id: 'cumbia-mil-horas',
    titulo: 'Mil Horas',
    artista: 'La Sonora Dinamita',
    genero: 'cumbia',
    itunesTrackId: 1444477195,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/5c/e2/0b/5ce20b1a-40f9-b6e4-403c-f9d952f73cd5/mzaf_2684394563317771294.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/8a/13/41/8a134171-5ee4-2844-e032-2b29905a46ed/780381007330.jpg/600x600bb.jpg',
  },
  {
    id: 'cumbia-cumbia-sampuesana',
    titulo: 'Cumbia Sampuesana',
    artista: 'Los Corraleros De Majagual',
    genero: 'cumbia',
    itunesTrackId: 1717156297,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/5e/27/f4/5e27f48d-3709-0746-3d03-f0cf30bc2fb8/mzaf_18329082403821872796.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/9a/d0/88/9ad088f2-6042-a200-5e97-47d4d10e8ad1/0.jpg/600x600bb.jpg',
  },
  {
    id: 'cumbia-la-colegiala',
    titulo: 'La Colegiala',
    artista: 'Rodolfo Aicardi & La Típica RA7',
    genero: 'cumbia',
    itunesTrackId: 1824755726,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/7d/12/af/7d12af24-a25f-7f19-2a78-a55ba687531f/mzaf_8135786754740439771.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/ea/a1/1c/eaa11c3d-74e6-7365-5a8d-b83b566c5e86/780381046384.jpg/600x600bb.jpg',
  },
  {
    id: 'merengue-suavemente',
    titulo: 'Suavemente',
    artista: 'Elvis Crespo',
    genero: 'merengue',
    itunesTrackId: 187429633,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/26/81/e9/2681e924-ffbe-4c44-6138-e71a6e1f5381/mzaf_12647945363787259301.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/0a/b6/2f/0ab62f9e-c72b-0968-d11e-24d2b38dd5d8/mzi.lomqptbg.jpg/600x600bb.jpg',
  },
  {
    id: 'merengue-el-venao',
    titulo: 'El Venao',
    artista: 'Wilfrido Vargas',
    genero: 'merengue',
    itunesTrackId: 1445571397,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/5e/9d/f1/5e9df172-5190-b2d6-9f4c-a42dc8381374/mzaf_17003820860285971361.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/1d/c6/32/1dc63290-7c01-8921-cb96-00594bfc624f/191018204167_cover.jpg/600x600bb.jpg',
  },
  {
    id: 'merengue-abusadora',
    titulo: 'Abusadora',
    artista: 'Wilfrido Vargas',
    genero: 'merengue',
    itunesTrackId: 304776748,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/14/c3/2e/14c32e26-dddf-7e9a-c92b-9e7f80394426/mzaf_14791324863568030697.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Features124/v4/b4/7a/fa/b47afae6-cbd5-a33b-82c9-88266bc6ef33/dj.rltloqtu.jpg/600x600bb.jpg',
  },
  {
    id: 'salsa-vivir-mi-vida',
    titulo: 'Vivir Mi Vida',
    artista: 'Marc Anthony',
    genero: 'salsa',
    itunesTrackId: 668743504,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/dd/71/e7/dd71e75b-d206-db22-03af-a003bd899120/mzaf_4969168093692780414.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/f7/24/ce/f724ce48-4d0d-0cbc-3493-3d935142e5e6/886443947238.jpg/600x600bb.jpg',
  },
  {
    id: 'salsa-pedro-navaja',
    titulo: 'Pedro Navaja',
    artista: 'Willie Colón & Rubén Blades',
    genero: 'salsa',
    itunesTrackId: 1464957419,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/85/63/99/8563997d-3ecd-ceee-8f22-3a850edc05ad/mzaf_13604459457562194517.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/b8/e3/8a/b8e38a85-4176-ee44-6d24-e6bb46635dd3/18CRGIM08715.rgb.jpg/600x600bb.jpg',
  },
  {
    id: 'salsa-la-vida-es-un-carnaval',
    titulo: 'La Vida Es Un Carnaval',
    artista: 'Celia Cruz',
    genero: 'salsa',
    itunesTrackId: 1771348591,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/54/bb/ba/54bbbae4-ae0b-73cf-d2c3-8daa7c3863ff/mzaf_13242627111046717848.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/05/72/83/057283f5-f0e6-98a3-2a90-699fbd909915/06UMGIM08573.rgb.jpg/600x600bb.jpg',
  },
  {
    id: 'balada-besame-mucho',
    titulo: 'Bésame Mucho',
    artista: 'Los Panchos',
    genero: 'balada',
    itunesTrackId: 465679706,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/59/3b/6d/593b6d5e-0bfd-14a3-ae2b-ec72bddcdbf6/mzaf_11191991464148369011.plus.aac.p.m4a',
    portadaUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/64/5e/84/mzi.vewtjetj.jpg/600x600bb.jpg',
  },
  {
    id: 'balada-historia-de-un-amor',
    titulo: 'Historia de un Amor',
    artista: 'Los Panchos',
    genero: 'balada',
    itunesTrackId: 1040872141,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/76/c7/36/76c736d4-bebd-18d9-4241-7489adeea1fc/mzaf_88953627223181659.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music20/v4/1b/69/b5/1b69b514-1f94-202a-a68c-b72a32c807c4/mzm.nheomvkj.jpg/600x600bb.jpg',
  },
  {
    id: 'balada-amor-eterno',
    titulo: 'Amor Eterno',
    artista: 'Juan Gabriel',
    genero: 'balada',
    itunesTrackId: 1579558851,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/05/ce/55/05ce55df-2d53-5bd2-c413-8c6afde10fe0/mzaf_17949446616463543185.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/02/38/9a/02389aac-b324-7ce8-080b-b3c88a697ccc/886446487090.jpg/600x600bb.jpg',
  },
  {
    id: 'ranchera-paloma-negra',
    titulo: 'Paloma Negra',
    artista: 'Lola Beltrán',
    genero: 'ranchera',
    itunesTrackId: 298685351,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/62/10/6d/62106d4e-9261-704c-7253-834bfb90b50f/mzaf_4021222140971679856.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music22/v4/b1/6b/9c/b16b9c18-7dea-a9fe-b8b7-40e7d1df6ba4/mzm.vpysdydu.jpg/600x600bb.jpg',
  },
  {
    id: 'ranchera-la-bikina',
    titulo: 'La Bikina',
    artista: 'Luis Miguel',
    genero: 'ranchera',
    itunesTrackId: 42017887,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/1c/ec/92/1cec92df-2722-9304-e567-f45975ff6b90/mzaf_16866995038248368032.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/19/37/91/193791ce-ea8e-5bfe-08db-3531a2347ad6/s06.bscrpmuo.jpg/600x600bb.jpg',
  },
  {
    id: 'ranchera-hermoso-carino',
    titulo: 'Hermoso Cariño',
    artista: 'Vicente Fernández',
    genero: 'ranchera',
    itunesTrackId: 322105694,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/5a/05/4b/5a054b95-c080-6faf-2e50-0ef8e9c6bb20/mzaf_6329465712463297356.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/fa/37/89/fa378973-c593-7940-08ec-1f635ed8410f/mzi.ckwgxywq.jpg/600x600bb.jpg',
  },
  {
    id: 'pop-la-camisa-negra',
    titulo: 'La Camisa Negra',
    artista: 'Juanes',
    genero: 'pop',
    itunesTrackId: 1492138460,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/3e/5f/41/3e5f41ee-be9b-268d-41ef-cd494f608e51/mzaf_1147478563772911556.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/9a/e5/f2/9ae5f2bc-2848-7bf7-c626-9d1f713ef4b0/19UM1IM09469.rgb.jpg/600x600bb.jpg',
  },
  {
    id: 'pop-corazon-espinado',
    titulo: 'Corazón Espinado',
    artista: 'Santana',
    genero: 'pop',
    itunesTrackId: 354579371,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/4a/f7/7b/4af77b0e-ce55-2e1e-784f-bf9b4b5bcdb3/mzaf_3071030762671393755.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/f5/97/4c/f5974c1e-06cb-f84c-1da9-5f7505a20a0c/mzi.etsqfvqq.jpg/600x600bb.jpg',
  },
  {
    id: 'pop-bailando',
    titulo: 'Bailando',
    artista: 'Enrique Iglesias',
    genero: 'pop',
    itunesTrackId: 1440820189,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ea/8d/6f/ea8d6fb5-d980-f295-62b0-3fbc7b78188e/mzaf_10172751316776147095.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/c7/18/3e/c7183ef7-49f1-8941-03cf-ad17ca8b97ea/00602537854097.rgb.jpg/600x600bb.jpg',
  },
  {
    id: 'rock-eres',
    titulo: 'Eres',
    artista: 'Café Tacvba',
    genero: 'rock',
    itunesTrackId: 1444184596,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ca/b6/88/cab68811-39fe-97bb-47da-7903fb274e07/mzaf_4817666131173906366.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/c0/82/4e/c0824e1f-1c08-93d1-2377-8b8d13c64242/06UMGIM10078.rgb.jpg/600x600bb.jpg',
  },
  {
    id: 'rock-la-flaca',
    titulo: 'La Flaca',
    artista: 'Jarabe de Palo',
    genero: 'rock',
    itunesTrackId: 726298588,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/59/8f/f1/598ff10e-0c1c-d1e1-6528-133f108188af/mzaf_1557029401913856762.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music49/v4/f1/b0/18/f1b018ce-fbd9-7867-1e25-27d7982ac40c/dj.njgkxzzp.jpg/600x600bb.jpg',
  },
  {
    id: 'rock-entre-dos-tierras',
    titulo: 'Entre Dos Tierras',
    artista: 'Héroes del Silencio',
    genero: 'rock',
    itunesTrackId: 700342801,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/6c/93/75/6c937564-1035-9beb-aca0-b79eeb38661e/mzaf_3451874824061234071.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/ff/31/04/ff31040e-0a66-675d-9a03-db5609596c63/dj.lspeprni.jpg/600x600bb.jpg',
  },
  {
    id: 'popular-fruta-fresca',
    titulo: 'Fruta Fresca',
    artista: 'Carlos Vives',
    genero: 'popular',
    itunesTrackId: 724352963,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/9d/24/e1/9d24e184-3015-6cb0-1f8a-9ff1b2e2d199/mzaf_1955404524858083767.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e8/5b/b7/e85bb768-5955-1079-4a21-210d0cb4f13e/00724352285457.jpg/600x600bb.jpg',
  },
  {
    id: 'popular-la-bicicleta',
    titulo: 'La Bicicleta',
    artista: 'Carlos Vives & Shakira',
    genero: 'popular',
    itunesTrackId: 1299332776,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/26/cf/97/26cf97d8-8047-25cd-e8bd-81090ceb3126/mzaf_1920180377816560693.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/8d/58/3d/8d583d74-d03c-b26e-9b4b-65a32f4eb8b0/886446730196.jpg/600x600bb.jpg',
  },
  {
    id: 'popular-se-me-olvido-otra-vez',
    titulo: 'Se Me Olvidó Otra Vez',
    artista: 'Juan Gabriel',
    genero: 'popular',
    itunesTrackId: 190279986,
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/f0/fc/2c/f0fc2ca4-071b-2a0b-4c65-4875dc6a5083/mzaf_13269969925804808610.plus.aac.p.m4a',
    portadaUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/2c/da/c2/2cdac263-837e-bc05-d1cb-802d28bc5f72/743213210421.jpg/600x600bb.jpg',
  },
];
