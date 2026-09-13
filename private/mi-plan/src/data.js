// Quantities transcribed from the supplied plan. Page numbers are physical PDF pages.
import {isDateKey} from './engine.js';
const F=(id,name,group,portion,unit,prep,page)=>({id,name,group,portion,unit,prep,page});
export const foods=Object.fromEntries([
 F('apple','Manzana','fruit',1,'pieza','natural',21),F('orange','Naranja','fruit',2,'pieza','natural',21),
 F('berries','Moras','fruit',.75,'taza','natural',21),F('strawberry','Fresa rebanada','fruit',1,'taza','rebanada',21),
 F('papaya','Papaya picada','fruit',1,'taza','picada',21),F('kiwi','Kiwi','fruit',1.5,'pieza','natural',21),
 F('blackberry','Zarzamora','fruit',1,'taza','natural',21),F('raspberry','Frambuesa','fruit',1,'taza','natural',21),
 F('pomegranate','Granada roja','fruit',1,'pieza','natural',21),F('banana','Plátano','fruit',.5,'pieza','natural',21),
 F('milk','Leche deslactosada light','skim-milk',1,'taza','lista para consumir',24),F('yogurt','Yogurt griego natural sin azúcar','skim-milk',1,'taza','listo para consumir',24),
 F('bread','Pan integral','cereal',1,'pieza','listo para consumir',22),F('tortilla','Tortilla de maíz','cereal',1,'pieza','lista para consumir',22),
 F('toast','Tostadas horneadas','cereal',2,'pieza','listas para consumir',22),F('rice','Arroz integral cocido','cereal',1/3,'taza','cocido',22),
 F('corn','Elote amarillo desgranado','cereal',.5,'taza','desgranado',22),F('nopal-tortilla','Tortilla de nopal','cereal',3,'pieza','lista para consumir',22),
 F('croissant','Croissant mediano','fat-cereal',.5,'pieza','listo para consumir',22),
 F('egg','Huevo entero','protein-moderate',1,'pieza','unknown',23),F('beef','Res sin grasa','protein-low',30,'gramos','unknown',23),
 F('shredded-beef','Carne de res deshebrada','protein-moderate',30,'gramos','deshebrada; pesaje no especificado',23),
 F('chicken','Pechuga de pollo','protein-very-low',30,'gramos','unknown',23),F('tuna','Atún en agua','protein-very-low',1/3,'lata','en agua',23),
 F('requeson','Requesón','protein-very-low',3,'cucharada','listo para consumir',23),
 F('tomato','Tomate / jitomate','vegetable',1,'pieza','natural',21),F('green-tomato','Tomate verde','vegetable',5,'pieza','natural',21),
 F('onion','Cebolla morada/blanca','vegetable',.5,'taza','natural',21),F('zucchini','Calabacita','vegetable',1,'pieza','natural',21),
 F('poblano','Chile poblano','vegetable',.5,'pieza','natural',21),F('nopal','Nopal cocido','vegetable',1,'taza','cocido',21),
 F('green-beans','Ejote cocido','vegetable',.5,'taza','cocido',21),F('pepper','Pimiento de color','vegetable',1,'pieza','natural',21),
 F('spinach','Espinaca cruda picada','vegetable',2,'taza','cruda picada',21),F('carrot','Zanahoria cruda picada/rallada','vegetable',.5,'taza','cruda picada/rallada',21),
 F('cherry','Tomate cherry','vegetable',4,'pieza','natural',21),F('mushroom','Champiñón crudo','vegetable',1,'taza','crudo',21),
 F('oil','Aceite de oliva','fat',1,'cucharadita','listo para usar',25),F('spray','Aceite en spray','fat',5,'disparo de 1 segundo','listo para usar',25),
 F('avocado','Aguacate','fat',1/3,'pieza','natural',25),
 ...['Vainilla','Endulzante natural','Canela en polvo','Chile guajillo','Ajo','Sal','Pimienta','Agua','Cilantro','Jugo de limón','Té sin azúcar','Paprika','Chile chipotle','Consomé de pollo natural','Barra Fiber One canela','Barra Fiber One caramelo'].map((name,i)=>F('extra'+i,name,'unverified',null,'', 'según receta',null))
].map(f=>[f.id,f]));
const I=(foodId,quantity,unit,optional=false,note='')=>({foodId,quantity,unit:unit||foods[foodId].unit,optional,note});
const X=(n,optional=false,quantity=null,unit='')=>I('extra'+n,quantity,unit,optional);
const R=(id,title,slot,page,ingredients,steps,warning='')=>({id,title,slot,page,ingredients,steps,warning,blockSwaps:!!warning});
export const recipes=[
 R('b0','Licuado de manzana',0,11,[I('apple',2),I('milk',1),X(0,true),X(1,true),X(2,true)],['Corta la manzana en trozos.','Licúa con la leche y, si deseas, vainilla, endulzante y canela.','Sirve.']),
 R('b1','Yogurt con moras',0,11,[I('berries',1.5),I('yogurt',1)],['Coloca el yogurt en un tazón.','Añade las moras y mezcla suavemente.']),
 R('b2','Licuado de fresa y papaya',0,12,[I('strawberry',1),I('papaya',1),I('milk',1),X(0,true),X(1,true)],['Lava las fresas y quita las hojas.','Pela y corta la papaya.','Licúa las frutas con la leche y los opcionales hasta obtener una mezcla homogénea.','Sirve.']),
 R('b3','Kiwi con yogurt',0,12,[I('kiwi',3),I('yogurt',1)],['Corta el kiwi en rodajas o cubos.','Coloca el yogurt en un tazón, agrega el kiwi y mezcla.']),
 R('a0','Huevos ahogados',1,13,[I('bread',2),I('spray',2.5),I('egg',2),I('tomato',1),I('onion',.25),X(3),X(4)],['Cuece el jitomate y el chile guajillo en agua caliente.','Licúa jitomate, cebolla, guajillo, sal y ajo.','Agrega aceite y salsa a una sartén; cuando hierva añade los huevos y tapa hasta que estén cocidos.','Sirve con el pan.']),
 R('a1','Chilaquiles rojos con huevos estrellados',1,13,[I('toast',4),I('avocado',1/6),I('egg',2),I('tomato',1.5),X(12),I('extra4',1,'diente'),I('onion',.25,'pieza')],['Asa los jitomates y la cebolla. Licúa con chipotle y ajo.','Sirve las tostadas y agrega la salsa.','Acompaña con aguacate picado y huevo estrellado.'],'La receta indica ¼ de cebolla en piezas; la tabla usa tazas. No se ha convertido esa medida.'),
 R('a2','Huevos en rajas de chile poblano y elote',1,14,[I('corn',1),I('spray',2.5),I('egg',2),I('poblano',.5),I('onion',.5),X(4),X(5),X(6),X(7)],['Asa el poblano, pela, retira semillas y corta en rajas.','Cuece la cebolla con las rajas y agua caliente.','Cocina los huevos en una sartén con el aceite indicado.','El texto original pide añadir crema, pero no incluye una cantidad entre los ingredientes. Consulta esta indicación antes de prepararla.'],'La preparación menciona crema que no figura en los ingredientes. No añadimos una cantidad inventada.'),
 R('a3','Huevo sobre tortilla con nopales',1,14,[I('tortilla',2),I('spray',2.5),I('egg',2),I('nopal',.5),I('onion',.25),I('tomato',.5),X(8),X(9,true),X(5)],['Calienta la tortilla y cocina el huevo con el aceite en spray.','Coloca el huevo sobre la tortilla.','Mezcla cebolla y jitomate picados con nopal cocido y cilantro.','El texto original también menciona aguacate sin cantidad; consulta esa indicación.'],'La preparación menciona aguacate no incluido en la lista de ingredientes.'),
 R('c0','Bistec de res con calabacita y tomate',2,15,[I('tortilla',2),I('oil',.5),I('beef',90),I('green-tomato',2),I('zucchini',1),I('onion',.5),X(5),X(6)],['Corta la res, pica la cebolla y corta calabacita y tomates.','Calienta el aceite y sofríe la cebolla.','Incorpora la res y cocina hasta que esté dorada.','Añade tomates y calabacita; cocina hasta que estén tiernos.','Sazona y acompaña con las tortillas.'],'La suma de verduras de la receta difiere de los 2 equivalentes indicados para comida. Se conserva el original y se bloquean cambios hasta aclararlo.'),
 R('c1','Ensalada de res, aguacate y nopales',2,15,[I('toast',4),I('avocado',1/6),I('shredded-beef',90),I('nopal',1),I('tomato',1),X(5),X(9),X(6),I('onion',null)],['Pica nopal, cebolla y jitomate.','El original indica cocer los nopales 10 minutos, aunque la lista ya dice cocidos.','Mezcla todos los ingredientes y sazona con sal, pimienta y limón.'],'La tabla diaria indica proteína baja en grasa, pero la res deshebrada aparece como moderada en la tabla de equivalencias. Falta cantidad de cebolla.'),
 R('c2','Guisado de ejotes con carne',2,16,[I('rice',2/3),I('oil',.25),I('avocado',1/6),I('beef',90),I('green-beans',.25),I('tomato',1),I('onion',.25),I('extra4',1,'diente'),I('extra13',1,'cucharada'),X(5),X(6),X(3)],['Corta cebolla, ajo y tomate.','Sofríe cebolla y ajo con el aceite, añade los demás ingredientes del guisado.','El original indica cocción a presión o en olla normal.','Sirve con arroz y aguacate.'],'Aceite y aguacate suman ¾ de equivalente de grasa; la tabla diaria indica ½. No ajustamos el plan automáticamente.'),
 R('c3','Ensalada tibia de res con verduras salteadas',2,16,[I('corn',1),I('oil',.5),I('beef',90),I('pepper',1),I('zucchini',1),I('spinach',1),X(5),X(6)],['Cocina la res en fajitas con aceite de oliva.','Corta pimiento y calabacita en tiras y saltea junto con la carne.','Añade espinaca y elote. Sazona y sirve.'],'Las verduras suman 2½ equivalentes; la distribución indica 2 para comida.'),
 R('s0','Croissant con naranja y té',3,17,[I('croissant',.5),I('orange',4),X(10)],['Acompaña el croissant con las naranjas y té sin azúcar.']),
 R('s1','Croissant con frutos rojos y té',3,17,[I('croissant',.5),I('blackberry',1),I('raspberry',1),X(10)],['Acompaña el croissant con las frutas y té sin azúcar.']),
 R('s2','Barrita Fiber One y granada roja',3,18,[I('extra14',1,'pieza'),I('pomegranate',2)],[], 'La barra de marca no tiene equivalencia específica en el catálogo del PDF. Cambios pendientes de revisión.'),
 R('s3','Barrita DASAVENA',3,18,[I('extra15',1,'pieza'),I('banana',1)],[], 'El título dice DASAVENA, pero los ingredientes dicen Fiber One caramelo. Confirmar la barra antes de usar esta opción.'),
 R('d0','Sopa de arroz con pollo y zanahoria',4,20,[I('rice',1/3),I('chicken',90),I('carrot',.5),I('zucchini',1),X(8),X(7)],['Corta y cuece el pollo en agua.','El original indica agregar arroz tras el primer hervor, aunque la lista dice arroz cocido.','Después agrega zanahoria, calabacita y cilantro y termina la cocción.'],'La receta usa arroz cocido en ingredientes y lo cuece de nuevo en preparación; las verduras también difieren de la distribución. Confirmar antes de adaptar.'),
 R('d1','Tostadas con requesón y cherry',4,19,[I('toast',2),I('requeson',9),I('cherry',6),X(6),X(11)],['Sirve el requesón y el cherry en pedazos sobre las tostadas.','Añade pimienta y paprika según el plan.']),
 R('d2','Tostadas de atún con jitomate y cebolla',4,19,[I('toast',2),I('tuna',1),I('onion',.5),I('tomato',.75),X(9)],['Abre el atún y escúrrelo.','Corta el jitomate en cubos y la cebolla en rodajas finas.','Mezcla con el atún y jugo de limón.','Reparte la mezcla sobre las tostadas.'],'Las verduras suman 1¾ equivalentes; la distribución indica 1½ para cena.'),
 R('d3','Tacos de requesón y champiñones',4,20,[I('nopal-tortilla',3),I('requeson',9),I('tomato',.75),I('mushroom',.75)],['Cocina los champiñones con el jitomate picado.','Agrega el requesón cuando las verduras estén suaves.','Calienta las tortillas y arma los tacos.'],'La preparación menciona aceite y sal sin cantidad; no se añaden porciones automáticamente.')
];
export const slots=[['Desayuno','08:00'],['Almuerzo','11:00'],['Comida','14:00'],['Colación','17:00'],['Cena','20:00']];
// Dinner IDs follow the weekly menu on page 10, not the recipe option numbers.
export function menuForDate(date){if(!isDateKey(date))return [];const d=new Date(date+'T12:00:00');const option=[2,0,1,2,3,0,1][d.getDay()];return ['b','a','c','s','d'].map(prefix=>recipes.find(r=>r.id===prefix+option));}
export const groupNames={'fruit':'Frutas','skim-milk':'Leche descremada','cereal':'Cereales sin grasa','fat-cereal':'Cereales con grasa','protein-very-low':'Proteína muy baja en grasa','protein-low':'Proteína baja en grasa','protein-moderate':'Proteína moderada en grasa','vegetable':'Verduras','fat':'Grasas sin proteína','unverified':'Sin equivalencia verificada'};
