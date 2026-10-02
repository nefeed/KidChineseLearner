// Shared scene vocabulary for the game and the offline narration plan.
// This module deliberately has no React, browser, or stylesheet dependencies.

export const NUMBERS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

export const COLORS: Record<string, string> = { 红: '#e99583', 黄: '#efcf79', 蓝: '#91bed8', 绿: '#92b887', 白: '#fffcf0', 黑: '#53605d' };

export const PETS: Record<string,{kind:string;food:string;name:string;hint:string}> = {
  猫:{kind:'cat',food:'fish',name:'小猫',hint:'小猫吃适合它的鱼肉。'},狗:{kind:'dog',food:'meat',name:'小狗',hint:'小狗吃适合它的肉食。'},牛:{kind:'cow',food:'grass',name:'小牛',hint:'小牛喜欢吃草。'},羊:{kind:'sheep',food:'grass',name:'小羊',hint:'小羊喜欢吃草。'},马:{kind:'horse',food:'grass',name:'小马',hint:'小马喜欢吃草。'},兔:{kind:'rabbit',food:'grass',name:'小兔',hint:'小兔主要吃草，也可以吃一点胡萝卜。'},
};

export const FOOD_WORDS: Record<string,{art:string;name:string}>={米:{art:'rice',name:'米粒'},面:{art:'noodles',name:'面条'},果:{art:'apple',name:'水果'},豆:{art:'beans',name:'豆子'},菜:{art:'leaf',name:'青菜'},肉:{art:'meat',name:'熟肉'},饭:{art:'rice',name:'米饭'},糖:{art:'candy',name:'糖果'}};
