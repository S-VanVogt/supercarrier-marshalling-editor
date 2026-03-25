-- ***************** This is not the original USS_Nimitz_RunwaysAndRoutes.lua ******************************
-- ********************** use at own risk, backup your original file !! ************************************
--   Runways, spawn points, taxi routes for SuperCarrier(s)
--   Edits by VanVogt

-- V1.2a in development
-- NO Cat1 version 


GT.RunWays =
{     
-- landing strip definition (first in table)
--	VppStartPoint; 					azimuth (degree} 	Length_Vpp; 	Width_Vpp;
	{{-45.00,	20.1494, -10.49}, 		350.8641, 			240.0, 			25.0, 		
-- alsArgument, lowGlidePath, slightlyLowGlidePath, onLowerGlidePath, onUpperGlidePath, slightlyHighGlidePath, highGlidePath
	0, 			2.5, 		  		2.8, 					3.0, 			  3.0, 				3.2, 				3.5},
-- runways --positions of the 4 catapults
	
	{{59.954,	20.1494, 18.02}, 	354.3, 				107.8, 			25.0, 		0, 2.5, 2.8, 3.0, 3.0, 3.2, 3.5},
	{{58.80,	20.1494, -3.752}, 	358.00, 			108.8, 			25.0, 		0, 2.5, 2.8, 3.0, 3.0, 3.2, 3.5},
	{{-37.374,	20.1494, -20.162},	355.002,	 		112.0, 			25.0, 		0, 2.5, 2.8, 3.0, 3.0, 3.2, 3.5},
	{{-56.176,	20.1494, -32.90}, 	359.957, 			130.0, 			25.0, 		0, 2.5, 2.8, 3.0, 3.0, 3.2, 3.5},
};

GT.RunWays.RunwaysNumber = #GT.RunWays -- assuming value is 4

GT.TaxiRoutes = 
	-- taxi routes and parking spots in LCS for landing AC ARRIVALS
	--vv there are 16 routes to spots 1-16
	--    x				y        z			V_target
{		
	{ -- 1 parking spot REAR AREA - Patio rear	not used if there's a blocker unit on P6 7 8 or 9. 
	--{{ 23.0,	19.6,		-20.0},  	3.0},
		{{ 13.0,	20.1494,		-19.0},  	5.0}, -- First and second points (runway and turnoff) are common LANDING arrival points for all 16 routes
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5a v2
		{{-60.6,		20.1494,		  4.3},		3.0}, --new p4 v2
		{{-110.2,		20.1494,		 12.1},		2.0}, --new p1 taxi to clear E3/Junkyard/Island
		{{-131.25,	20.1494,		 17.05}, 	2.0},
		{{-141.15,	20.1494,		 24.2}, 	1.0}	--goes to Patio rear
	},
	{ -- 2 parking spot REAR AREA - Patio mid
		--{{  24.0,	20.1494,		-21.27},  	3.0},
		{{ 13.0,	20.1494,		-19.0},  	5.0}, 
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-10.0,	20.1494,		  7.0},  	3.0},
--		{{-105.0,	20.1494,		 20.0},  	6.0},		
--		{{-118.7,	20.1494,		 15.9}, 	2.0},
		{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5a v2
		{{-60.6,		20.1494,		  4.3},		3.0}, --new p4 v2
		{{-110.2,		20.1494,		 12.1},		2.0}, --new p1 taxi to clear E3/Junkyard/Island
		{{-125.30,	20.1494,		 21.3}, 	1.0},
		{{-129.20,	20.1494,		 26.2}, 	1.0}
	},
	{ -- 3 parking spot REAR AREA - Patio front
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-10.0,	20.1494,		  7.0},  	3.0},
--		{{-110.0,	20.1494,		 20.0},  	4.0},		
		{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5a v2
		{{-60.6,		20.1494,		  4.3},		3.0}, --new p4 v2
		{{-110.2,		20.1494,		 12.1},		2.0}, --new p1 taxi to clear E3/Junkyard/Island
		{{-116.5,	20.1494,		 25.0}, 	2.0},
		{{-118.0,	20.1494,		 28.0}, 	1.0}
	},
	
	{ -- 4 parking spot (lift3_1) REAR AREA
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
--		{{-10.0,	20.1494,		  7.0},  	3.0},
--		{{-95.0,	20.1494,		 19.0},  	6.0},
			{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5 v2
			{{-60.6,		20.1494,		  4.3},		3.0}, --new p4 v2
			{{-91.2,		20.1494,		 8.7},		2.0}, --new p3		
		{{-102.7,	20.1494,		 10.7}, 	2.0}, --p2
		{{-102.5,	20.1494,		 34.0}, 	1.0,	3.0*60.0}
	},
	{ -- 5 parking spot (lift3_2) REAR AREA
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
--		{{-10.0,	20.1494,		  7.0},  	3.0},
--		{{-80.0,	20.1494,		 16.0},  	6.0},
			{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5 v2
			{{-60.6,		20.1494,		  4.3},		3.0}, --new p4 v2	
		{{-91.2,	20.1494,		 8.7}, 	2.0},  --new p3
		{{-90.0,	20.1494,		 34.0}, 	1.0,	3.0*60.0}
	},
	
	{ -- 6 parking spot (Junkyard) ISLAND AREA
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-10.0,	20.1494,		  7.0},  	3.0},
		{{-65.5,	20.1494,		 16.0},  	6.0},		
		{{-82.0,	20.1494,		 13.0}, 	2.0},
		{{-79.0,	20.1494,		 26.5}, 	1.0}
	},
	
	{ -- 7 parking spot (island 1) ISLAND AREA
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-10.0,	20.1494,		  7.0},  	3.0},
		{{-55.0,	20.1494,		 14.0},  	4.0},		
		{{-72.0,	20.1494,		  7.0}, 	2.0},
		{{-65.8,	20.1494,		 18.8}, 	1.0}
	},
	
	{ -- 8 parking spot (island 2) ISLAND AREA
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-37.9,	20.1494,		 10.0},  	3.0},
		{{-48.2,	20.1494,		 -1.1},  	4.0},		
		{{-54.5,	20.1494,		  2.5}, 	2.0},
		{{-55.5,	20.1494,		  9.1}, 	1.0},
		{{-52.0,	20.1494,		 17.0}, 	1.0}
	},
	
	{ -- 9 parking spot (island 3) ISLAND AREA This is THE Blocker spot to close off all rear parking, use a static.
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-10.0,	20.1494,		  7.0},  	3.0},
		{{-26.0,	20.1494,		  8.0},  	4.0},		
		{{-46.6,	20.1494,		  5.0}, 	2.0}, -- was -42.5 3.5
		{{-40.2,	20.1494,		 16.0}, 	1.0} -- was -37 16
	},	
	
	{ -- 10 parking spot (lift2_1)
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-20.0,	20.1494,		 12.8},  	3.0},   --from -19 to -25 to straighten postspinn angle
		{{-25.0,	20.1494,		 21.3}, 	2.0},  	-- change x from -23 to -25.2 (spawn coord) to debug blockage
		{{-25.0,	20.1494,		 25.0}, 	2.0},	-- test extra point	
		{{-25.0,	20.1494,		 34.0}, 	1.0} 	-- change x from -23 to -25.2 (spawn coord) to debug blockage
	},
	{ -- 11 parking spot (lift2_2)
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		--{{-10.0,	20.1494,		  7.0},  	2.0},
		{{-7.0,		20.1494,		 10.0},  	2.0},
		{{-13.1,	20.1494,		 16.0}, 	2.0}, 	--    from -11 to  -13.1
		{{-13.1,	20.1494,		 34.0}, 	1.0}, 	--	despawn removed 3.0*60.0}		-- last number - 3*60sec = 3 minutes for despawn object at this point
	},
	
	{ -- 12 parking spot (Corral)
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{ 6.0,		20.1494,		 13.0}, 	2.0},
		{{ 6.0,		20.1494,		 32.5}, 	1.0}
	},
		
	{ -- 13 parking spot (Point fwd)
		{{ 13.0,	20.1494,		-19.0},  	5.0},	-- route now goes over cat 1 and avoids E1 and its parked planes. No corresponding spawn pt
		{{ 22.0,	20.1494,		  3.5},  	3.0},
		{{ 45.3,	20.1494,		 17.4},  	3.0}, 	--np10
		{{ 60.8,	20.1494,		 22.7}, 	1.0}, 	-- test 
		{{ 64.7,	20.1494,		 29.5}, 	1.0}, 	--test
		{{ 69.4,	20.1494,		 32.9}, 	1.0},	--despawn removed	6.0*60.0} This spot now fouls cat1.		
	},
	{ -- 14 parking spot (Point aft) not SWAPPED with 13
		{{ 13.0,	20.1494,		-19.0},  	5.0},	--route now goes over cat 1 and avoids E1 and its parked planes. No corresponding spawn pt
		{{ 22.0,	20.1494,		  3.5},  	3.0},			
		{{ 43.7,	20.1494,		 16.2},  	2.0}, 	--np10 not quite,aft a bit
		{{ 46.3,	20.1494,		30.0}, 		1.0},	-- almost back to original
		{{ 53.0,	20.1494,		 34.0}, 	1.0},	--despawn removed	6.0*60.0} This spot now fouls cat1.		
	},

	
	{ -- 15 parking spot (lift1_1) rear
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 22.0,	20.1494,		  3.5},  	3.0},		
		{{ 22.6,	20.1494,		 15.0}, 	2.0}, 	--moved aft from 23.0
		{{ 22.6,	20.1494,		 34.0}, 	1.0, 3*60.0}, 	--despawn removed	10.0*60.0}		-- last number - 3*60sec = 3 minutes for despawn object at this point
	},
	{ -- 16 parking spot (lift1_2) fwd
		{{ 13.0,	20.1494,		-19.0},  	5.0},
		{{ 22.0,	20.1494,		  3.5},  	3.0},
		{{ 30.0,	20.1494,		 10.0},  	2.0},	-- x35 to 33.5	
		{{ 33.0,	20.1494,		 18.0}, 	2.0},   -- x35 to 33.5	
		{{ 35.0,	20.1494,		 34.0}, 	1.0, 3*60.0},	--despawn removed	10.0*60.0}		-- last number - 3*60sec = 3 minutes for despawn object at this point
	},	
	
	-- this was commented out by ED, no corresponding entries in crew.lua, cannot be used as is.
	
	--[[{ -- 17 parking sp     ot (6pack 1)
		{{  5.0,	20.1494,		-17.8},  	3.0},
		{{ 10.0,	20.1494,		  5.0},  	3.0},
		{{-10.0,	20.1494,		  7.0},  	2.0},
		{{-25.0,	20.1494,		 11.0},  	2.0},
		{{-41.0,	20.1494,		  4.0}, 	1.0},
		{{-28.0,	20.1494,		 12.0}, 	-2.0}
	},
	
	{ -- 18 parking spot (6pack 2)		
		{{  5.0,	20.1494,		-17.8},  	3.0},
		{{ 10.0,	20.1494,		 15.0},  	2.0},
		{{-10.0,	20.1494,		  9.0},  	2.0},
		{{-25.0,	20.1494,		  3.0},  	1.0},		
		{{-10.0,	20.1494,		  9.0}, 	-2.0}
	},
	
	{ -- 19 parking spot (6pack 3)
		{{ 15.0,	20.1494,		-19.3},  	3.0},
		{{ 35.0,	20.1494,		  5.0},  	2.0},
		{{ 17.0,	20.1494,		 10.0},  	2.0},
		{{ -3.0,	20.1494,		  1.5},  	1.0},		
		{{  4.0,	20.1494,		  8.0}, 	-2.0}
	},
	
	{ -- 20 parking spot (6pack 4)
		{{ 15.0,	20.1494,		-19.3},  	3.0},
		{{ 35.0,	20.1494,		 10.0},  	2.0},
		{{ 18.0,	20.1494,		  5.0},  	2.0},
		{{ 12.0,	20.1494,		  0.0},  	1.0},		
		{{ 18.0,	20.1494,		  6.5}, 	-2.0}
	},]]--
	
}
GT.TaxiRoutes.RoutesNumber = #GT.TaxiRoutes -- 16 parking routes


GT.TaxiForTORoutes = 
	-- taxi routes and parking spots in LCS 
	-- SPAWN point (first point) & taxi to cats
		--    x				y        z			V_target		terminal size
	{		
	{ RunwayIdx = 2, Points =
		{ -- 1 spawn spot(6pack 1) -> catapult 1
			{{ 24.5,	20.1494,		    9.5}, 	1.0,	12.0},
			{{ 18.5,	20.1494,		    3.0},  	1.0},
			{{ 19.0,	20.1494,		   -2.0},  	1.0},			
			{{  25.0,	20.1494,		  -2.9},  	2.0}, --np6a
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		  -3.68}, 	1.0}
		}
	},
	{ RunwayIdx = 2, Points =
		{ -- 2 spawn spot(6pack 2) -> catapult 2
			{{  7.6,	20.1494,	       10.5}, 	1.0,	12.0},
			{{  3.1,	20.1494,		   4.0},  	1.0},
			{{  7.5,	20.1494,		  -1.0},  	2.0},
			{{  25.0,	20.1494,		  -2.9},  	2.0}, --np6a
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		  -3.68}, 	1.0}
		}
	},
	{ RunwayIdx = 3, Points =
		{ -- 3 spawn spot(6pack 3) -> catapult 3
			{{-9.9,	    20.1494,		 10.8},  	1.0,	12.0},
			{{-21.2,	20.1494,		  -5.8},  	3.0}, --6p3-p2 new to clear 6p spawn4
			{{-62.0,	20.1494,		 -1.5},		3.0},
			{{-67.0,	20.1494,		-17.0},  	2.0},
			{{-55.0,	20.1494,		-18.8},  	1.0},
			{{-39.4,	20.1494,        -19.92}, 	1.0}
		}
	},	
	{ RunwayIdx = 4, Points =
		{ -- 4 spawn spot(6pack 4) -> catapult 4
			{{-25.2,	20.1494,		 13.0},		1.0,	12.0}, --6p v2 moved out of P9 a bit
			{{-27.2,	20.1494,		 11.5},		1.0},	-- initial orientation point, slowed down to let 3 taxi before
			{{-31.7,	20.1494,	 	 -4.6},		1.0}, 	-- 6p4-p2 new rotate clockwise to clear P9
			{{-81.0,	20.1494,		 2.4},		2.0}, 	-- to clear cat 3 better
			{{-83.0,	20.1494,		-20.0},		2.0},
			{{-79.0,	20.1494,		-32.8},	    2.0},
			{{-70.0,	20.1494,		-33.3},	    1.0},
			{{-58.5,	20.1494, 		-32.8},	    1.0}
		}
	},	
	{ RunwayIdx = 2, Points =
		{ -- 5 spawn spot(lift2 p1) -> catapult 1		
			{{-13.1,	20.1494,		 34.0},  	2.0, 12.0}, 	--shifted aft
			{{-13.1,	20.1494,		 13.0},  	2.0}, 	-- moved in
			{{  25.0,	20.1494,		  -2.9},  	2.0}, --np6a
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		  -3.68}, 	1.0}
		}
	},
	{ RunwayIdx = 2, Points =
		{ -- 6 spawn spot(lift2 p2) -> catapult 2
			{{-25.2,	20.1494,		 34.0},  	1.0}, --shifted aft a bit
			{{-25.2,	20.1494,	  	 11.0},  	2.0}, --shifted aft a bit
			{{  7.0,	20.1494,		  3.0},  	2.0},
			{{  25.0,	20.1494,		  -2.9},  	2.0}, --np6a
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		-3.68}, 	1.0}
		}
	},
	{ RunwayIdx = 3, Points =
		{ -- 7 spawn spot(lift4 p1) -> catapult 3	
			{{-98.0,		20.1494,		-34.0},		1.0}, -- moved aft from -96 to -97
			{{-98.0,		20.1494,		-16.0},		2.0},
			{{-75.0,		20.1494,		-16.0},		2.0},
			{{-65.0,		20.1494,		-17.3},  	2.0},
			{{-55.0,		20.1494,		-18.8},  	2.0},
			{{-39.4,		20.1494,        -19.92}, 	1.0}
		}
	},
	{ RunwayIdx = 4, Points =
		{ -- 8 spawn spot(lift4 p2) -> catapult 4
			{{-110.0,		20.1494,		-34.0},		1.0}, -- moved aft from -108 to -110
			{{-110.0,		20.1494,		-14.0},		2.0},
			{{-90.0,		20.1494,		-14.0},		2.0},
			{{-79.0,		20.1494,		-32.8},	    2.0},
			{{-70.0,		20.1494,		-33.3},	    1.0},
			{{-58.5,		20.1494, 		-32.8},	    1.0}
		}
	},
	{ RunwayIdx = 2, Points =
		{ -- 9 spawn spot(lift3 p1-fwd) -> catapult 1	
			{{-92.0,		20.1494,		 34.0},		1.0, 12.0}, --p5
			{{-92.0,		20.1494,		 8.7},		2.0}, --new p3
			{{-60.6,		20.1494,		  4.3},		3.0}, --new p4a
			{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5a
			{{  25.0,	20.1494,		  -2.9},  	2.0}, --np6a
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		  -3.68}, 	1.0}
			
		}
	},
	{ RunwayIdx = 2, Points =
		{ -- 10 spawn spot(lift3 p2-aft) -> catapult 2
			{{-103.5,		20.1494,		 34.0},		1.0}, -- p4
			{{-103.7,		20.1494,		 10.7},		2.0}, --new p2
			{{-91.2,		20.1494,		 8.7},		2.0}, --new p3
			{{-60.6,		20.1494,		  3.3},		3.0}, --new p4 v2 was 4.3
			{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5 v2
			{{ 7.8,	   		20.1494,		  -3.6},  	2.0}, --new p6
			{{ 25.0,	    20.1494,		  -2.9},  	1.0}, --new p6a
			{{  55.9,		20.1494, 		-3.68}, 	1.0}  -- cat 2
			
--			{{-102.5,		20.1494,		 34.0},		1.0}, --original
--			{{-102.5,		20.1494,		 12.7},		2.0},
--			{{-60.0,		20.1494,		  8.0},		3.0},
--			{{-10.0,		20.1494,		  3.8},  	3.0},
--			{{ 44.3,		20.1494,		-3.25},  	2.0},
--			{{  55.9,		20.1494, 		-3.68}, 	1.0}
		}
	},
	
	--new spawn points
	{ RunwayIdx = 2, Points =
		{ -- 11 spawn spot(lift1 p1 -fwd) -> catapult 1
			{{ 35.0,	20.1494,		 	34.0},	1.0, 12.0}, --added 5.0 spawn diameter to restrict spawning test 10.15 too small, 10.19 f14 still there,
			{{ 34.8,	20.1494,		 	16.2},	1.0},	-- np 7a		direct turn to cat1 instead of original.
			{{  25.0,	20.1494,		  -2.9},  	2.0}, --np6a
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		  -3.68}, 	1.0}
		}
	},
	{ RunwayIdx = 2, Points =
		{ -- 12 spawn spot(lift1 p2 -aft) -> catapult 2			
			{{ 23.0,	20.1494,		 	34.0},	1.0},
			{{ 23.0,	20.1494,		 	23.0},	1.0},			
			{{  18.9,	20.1494,	       9.8}, 	1.0}, -- moved fwd to clear P12 better on exit
--			{{  3.1,	20.1494,		   4.0},  	1.0},
--			{{  7.5,	20.1494,		  -1.0},  	2.0},
			{{  24.6,	20.1494,		  -2.0},  	1.0}, -- moved back from JBD
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		  -3.68}, 	1.0}

		}
	},
	{ RunwayIdx = 2, Points =
		{ -- 13 spawn spot(Corral) -> catapult 2
			{{  6.0,		20.1494,		 32.5},	1.0},
			{{  6.0,		20.1494,		 10.5},	1.0},			
			{{	13.0,	    20.1494,		 0.0},  1.0},
			{{ 25.0,	    20.1494,	  -2.9},  	1.0}, --new p6a
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		  -3.68}, 	1.0}
		}
	},	
	

	{ RunwayIdx = 2, Points =
		{ -- 14 spawn spot(Patio front 3 parking spot) -> catapult 1
			{{-118.0,		20.1494,		 28.0},		1.0, 12.0},
			{{-110.2,		20.1494,		 12.1},		2.0}, --new p1 taxi to clear E3/Junkyard/Island
			{{-60.6,		20.1494,		  3.3},		3.0}, --new p4 v2 was 4.3
			{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5a v2
			{{ -6.0,	    20.1494,		  13.6},  	2.0}, --new p9
			{{  25.0,	20.1494,		  -2.9},  	2.0}, --np6a
			{{  39.5,	20.1494,		  -3.20},  	1.0}, --Cat2pre new
			{{  55.9,	20.1494, 		  -3.68}, 	1.0}
		}
	},
	{ RunwayIdx = 3, Points =
		{ -- 15 spawn spot(Patio mid 2 parking spot) -> catapult 3
			{{-129.2,		20.1494,		 26.2},		1.0,	20.0},
			{{-123.7,		20.1494,		 19.2},		1.0},		-- edited to clear other patio planes.
			{{-122.7,		20.1494,		 12.1},		1.0},				
			{{-96.0,		20.1494,		-16.0},		2.0},
			{{-75.0,		20.1494,		-16.0},		2.0},
			{{-65.0,		20.1494,		-17.3},  	2.0},
			{{-55.0,		20.1494,		-18.8},  	2.0},
			{{-39.4,		20.1494,        -19.92}, 	1.0}
		}
	},
	{ RunwayIdx = 4, Points =
		{ -- 16 spawn spot(Patio rear 1 parking spot) -> catapult 4
			{{-141.15,		20.1494,		 24.2},		1.0,	20.0},		
			{{-137.0,		20.1494,		 21.2},		1.0}, -- new s16 p2
			{{-130.0,		20.1494,		  4.0},		1.0},

			{{-108.0,		20.1494,		-7.0},		2.0}, --moved down from 13.0 for el3 clearance
			{{-90.0,		20.1494,		-13.0},		2.0},
			{{-79.0,		20.1494,		-32.2},	    2.0}, --moved down from 32.8 Cat4 alignment turn tweak - test with F14.
			{{-70.0,		20.1494,		-32.8},	    1.0}, -- moved from 33.3 down
			{{-58.5,		20.1494, 		-32.8},	    1.0}
		}
	},

--[[  exclude for fantail group sp 14 15 16 replacement

	{ RunwayIdx = 1, Points =
		{ -- 17 spawn spot -> catapult 1
			{{-155.2,		20.1494,		 15.4},		1.0}, --Stern1
			{{-138.0,		20.1494,		 12.3},		1.0}, --Stern1B
			{{-110.2,		20.1494,		 12.1},		2.0}, --new p1
			{{-60.6,		20.1494,		  4.3},		3.0}, --new p4 v2
			{{-32.4,		20.1494,		  -1.0},	3.0}, --new p5 v2
			{{ 7.8,	    20.1494,		  -3.6},  	2.0}, --new p6
			{{ 36.4,	20.1494,		    13.7},  2.0}, --new p7
			{{ 49.2,	20.1494,		    19.0},  1.0},	 --new p8	v2	
			{{ 55.0,	20.1494, 	 	   18.54},	1.0} -- cat1
		}
	},
	{ RunwayIdx = 3, Points =
		{ -- 18 spawn spot -> catapult 3
			{{-157.1,		20.1494,		 4.3},		1.0}, 	--Stern2
			{{-138.8,		20.1494,		 0.9},		1.0},	--Stern2B							
			{{-75.0,		20.1494,		-16.0},		2.0},
			{{-65.0,		20.1494,		-17.3},  	2.0},
			{{-55.0,		20.1494,		-18.8},  	2.0},
			{{-39.4,		20.1494,        -19.92}, 	1.0}
		}
	},
	{ RunwayIdx = 4, Points =
		{ -- 16 spawn spot(1 parking spot) -> catapult 4
			{{-156.2,		20.1494,		-7.0},		1.0},	--Stern3		
			{{-130.0,		20.1494,		-7.3},		1.0},	--Stern3B
			{{-108.0,		20.1494,		-7.0},		2.0},
			{{-90.0,		20.1494,		-13.0},		2.0},
			{{-79.0,		20.1494,		-32.8},	    2.0},
			{{-70.0,		20.1494,		-33.3},	    1.0},
			{{-58.5,		20.1494, 		-32.8},	    1.0}
		}
	},
	
--]]
	
	
	
}
GT.TaxiForTORoutes.RoutesForTONumber = #GT.TaxiForTORoutes


GT.HelicopterSpawnTerminal = 
	-- taxi routes and parking spots in LCS
	--    x				y        z			direction
{		
	{ TerminalIdx = 1, Points =
		{ -- 1 spawn spot
			{{ 147.0,	20.1494,		    -0.18}, 	0.0}			
		}
	},
	{ TerminalIdx = 2, Points =
		{ -- 2 spawn spot
			{{   113.0,	20.1494,	       -10.3}, 	0.0}			
		}
	},
	{ TerminalIdx = 3, Points =
		{ -- 3 spawn spot
			{{55.0,	20.1494,		 		-31.45},  	0.0}
		}
	},	
	{ TerminalIdx = 4, Points =
		{ -- 4 spawn spot
			{{20.6,	20.1494,		 		-28.75},		0.0}
		}
	},	
	{ TerminalIdx = 5, Points =
		{ -- 5 spawn spot
			{{-8.9,	20.1494,		 		-28.75},  	0.0}
		}
	},
	{ TerminalIdx = 6, Points =
		{ -- 6 spawn spot
			{{-39.7,	20.1494,		 	-28.75},  	0.0}
		}
	},
	{ TerminalIdx = 7, Points =
		{ -- 7 spawn spot
			{{-100.6,		20.1494,		-31.0},		0.0}
		}
	},
	{ TerminalIdx = 8, Points =
		{ -- 8 spawn spot
			{{-94.8,		20.1494,			32.2},		0.0}
		}
	},
}
GT.HelicopterSpawnTerminal.TerminalNumber = #GT.HelicopterSpawnTerminal


GT.ArrestingGears =
{
	--[[
	--[example]
	{
		-- coordinates for spools (Left and Right) in LCS:
		-- if connector exists write connector name
		-- else write position coordinates manually  -- [pos] omitted when [connector_name] exists
		Left =	{ connector_name = '',	pos = {xl,yl,zl} },
		Right =	{ connector_name = '',	pos = {xr,yr,zr} }
	},
	--]]
	{
		Left = {	connector_name = 'POINT_TROS_01_01' },
		Right = {	connector_name = 'POINT_TROS_01_02' }
	},
	{
		Left = {	connector_name = 'POINT_TROS_02_01' },
		Right = {	connector_name = 'POINT_TROS_02_02' }
	},
	{
		Left = {	connector_name = 'POINT_TROS_03_01' },
		Right = {	connector_name = 'POINT_TROS_03_02' }
	},
	{
		Left = {	connector_name = 'POINT_TROS_04_01' },
		Right = {	connector_name = 'POINT_TROS_04_02' }
	},
}
GT.ArrestingGears.ArrestingGearsNumber = #GT.ArrestingGears

-- terminals that blocks taxi to other terminals for examle - terminals near the island bloks taxi to stern parkings
-- when blocker terminal is assigned or obstacled - parking with greater number will be searched to taxi to
GT.BlockerTerminals = {8,9} --removed 6 and 7.
GT.BlockerTerminals.BlockerTerminalsNumber = #GT.BlockerTerminals

GT.Elevators = 
-- ElevatorTypes :	SPAWN	= 0, DESPAWN = 1, BOTH	= 2
-- elevator routes and parking spots in LCS
	--    x				y        z			V_target
{		
	{ 	ElevatorIdx = 1, ElevatorType = 0, TerminalIdx = 1,	Points = -- type original was 1 All elevators deactivated. trying 2 here.... works well.
		{ 
			{{ 23.5,	8.45,	 34.0}, 	1.0},
			{{ 25.0,	8.45,	 19.75}, 	1.0},
			{{ 21.5,	8.45,	  0.0}, 	1.0},
			{{ 21.5,	8.45,	 -8.0}, 	1.0}
		}
	},
	{
		ElevatorIdx = 1, ElevatorType = 0, TerminalIdx = 2,	Points = -- type original was 1
		{ 
			{{ 35.0,	8.45,	 34.0}, 	1.0},
			{{ 30.5,	8.45,	 20.0}, 	1.0},
			{{ 34.0,	8.45,	  0.0}, 	1.0},
			{{ 34.0,	8.45,	 -8.0}, 	1.0}
		}
	},	
	{ 
		ElevatorIdx = 2, ElevatorType = 0, TerminalIdx = 1,	Points = -- type original was 1
		{ 
			{{ -25.0,	8.45,	 33.0}, 	1.0},
			{{ -25.0,	8.45,	 14.0}, 	1.0},
			{{ -26.5,	8.45,	  0.0}, 	1.0},
			{{ -26.5,	8.45,	 -8.0}, 	1.0}
		}
	},
	{
		ElevatorIdx = 2, ElevatorType = 0, TerminalIdx = 2,	Points = -- type original was 1
		{ 
			{{ -13.0,	8.45,	 33.0}, 	1.0},
			{{ -18.0,	8.45,	 18.0}, 	1.0},
			{{ -14.0,	8.45,	  2.5}, 	1.0},
			{{ -14.0,	8.45,	 -8.0}, 	1.0}			
		}
	},
	{ 
		ElevatorIdx = 3, ElevatorType = 0, TerminalIdx = 1,	Points = -- type original was 1
		{ 
			{{ -103.5,	8.45,	 34.0}, 	1.0},
			{{ -103.5,	8.45,	 18.5}, 	1.0},
			{{ -106.0,	8.45,	  0.0}, 	1.0},
			{{ -106.0,	8.45,	 -8.0}, 	1.0}
		}
	},
	{
		ElevatorIdx = 3, ElevatorType = 0, TerminalIdx = 2, Points = -- type original was 1
		{ 
			{{ -92.0,	8.45,	 34.0}, 	1.0},
			{{ -96.5,	8.45,	 16.5}, 	1.0},
			{{ -93.7,	8.45,	  0.0}, 	1.0},
			{{ -94.0,	8.45,	 -8.0}, 	1.0}
		}
	},
	{ 
		ElevatorIdx = 4, ElevatorType = 0, TerminalIdx = 1, Points = -- type original was 0
		{ 
			{{ -96.0,	8.45,	 -34.0}, 	1.0},
			{{ -96.0,	8.45,	 -34.0}, 	1.0},
			{{ -103.5,	8.45,	  0.0}, 	1.0},
			{{ -115.0,	8.45,	-5.0}, 	1.0}
		}
	},
	{
		ElevatorIdx = 4, ElevatorType = 0, TerminalIdx = 2,	Points = -- type original was 0
		{ 
			{{ -108.0,	8.45,	 -34.0}, 	1.0},
			{{ -108.0,	8.45,	 -34.0}, 	1.0},
			{{ -91.7,	8.45,	  0.0}, 	1.0},
			{{ -80.0,	8.45,	-5.0}, 	1.0}
		}
	},
}
GT.Elevators.ElevatorsNumber = #GT.Elevators	
