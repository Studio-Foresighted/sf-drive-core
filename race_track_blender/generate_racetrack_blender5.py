"""
Procedural racetrack generator for Blender 5.x
Run in a fresh Blender startup: File > Run Script (or run from Text Editor)
Generates objects named exactly: Track_Road, Track_Walls, Track_Props, Track_Collider

Adjustable parameters below control track shape and detail.
"""
import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix

# ------------------- PARAMETERS (easy to tweak) -------------------
SEED = 42
TRACK_WIDTH = 10.0  # meters
STRAIGHTS = 4
STRAIGHT_LEN_RANGE = (120.0, 150.0)  # meters
MEDIUM_CURVES = 4
MEDIUM_ANGLE_RANGE = (40.0, 60.0)  # degrees
MEDIUM_RADIUS_RANGE = (80.0, 140.0)  # meters (approx)
TIGHT_CURVES = 4
TIGHT_ANGLE_RANGE = (70.0, 110.0)  # degrees
TIGHT_RADIUS_RANGE = (30.0, 60.0)  # meters
TIGHT_BANK_ANGLE_RANGE = (5.0, 12.0)  # degrees banking on tight curves
WALL_HEIGHT = 1.0  # meters
WALL_THICKNESS = 0.2  # meters
PROP_DENSITY = 0.02  # props per meter of track
PROP_OFFSET_MIN = 6.0  # meters from centerline (beyond wall)
PROP_OFFSET_MAX = 30.0
SAMPLE_PER_CURVE_DEG = 5.0  # degrees per sample on curved arcs
ROAD_PROFILE_THICKNESS = 0.05
COLLIDER_DENSITY = 0.5  # fraction of samples used for collider (lower -> fewer verts)

# -----------------------------------------------------------------
random.seed(SEED)

# Clear default scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Set metric units
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# Create a new collection for the track
main_col = bpy.data.collections.new('RaceTrack')
bpy.context.scene.collection.children.link(main_col)

# Helper math functions
def rotation_2d(vec, ang):
    ca = math.cos(ang)
    sa = math.sin(ang)
    return Vector((vec.x * ca - vec.y * sa, vec.x * sa + vec.y * ca))

# Build centerline as sequence of segments (straights and arcs)
center_pts = []
head = Vector((1.0, 0.0))  # initial heading along +X
pos = Vector((0.0, 0.0))
center_pts.append(Vector((pos.x, pos.y, 0.0)))

# Build pattern: alternate straights + curves in an interleaved sequence
# We'll create sequence length = STRAIGHTS + MEDIUM_CURVES + TIGHT_CURVES
segments = []
# Use a simple layout: for i in range(total_segments), pick type in repeating order
segment_types = []
for i in range(max(STRAIGHTS, MEDIUM_CURVES, TIGHT_CURVES) * 3):
    # create an interleaved pattern: Straight, Medium, Straight, Tight ... until counts used
    if len([t for t in segment_types if t=='S']) < STRAIGHTS:
        segment_types.append('S')
    if len([t for t in segment_types if t=='M']) < MEDIUM_CURVES:
        segment_types.append('M')
    if len([t for t in segment_types if t=='T']) < TIGHT_CURVES:
        segment_types.append('T')
    if len(segment_types) >= (STRAIGHTS + MEDIUM_CURVES + TIGHT_CURVES):
        break

# Shuffle medium and tight order to make layout interesting
random.shuffle(segment_types)

# Ensure we have reasonable alternation; if not, add straights to fill
while len([t for t in segment_types if t=='S']) < STRAIGHTS:
    segment_types.append('S')

# Now generate points
for seg in segment_types:
    if seg == 'S':
        length = random.uniform(*STRAIGHT_LEN_RANGE)
        pos = pos + head * length
        center_pts.append(Vector((pos.x, pos.y, 0.0)))
    else:
        if seg == 'M':
            angle_deg = random.uniform(*MEDIUM_ANGLE_RANGE)
            radius = random.uniform(*MEDIUM_RADIUS_RANGE)
            bank = 0.0
        else:
            angle_deg = random.uniform(*TIGHT_ANGLE_RANGE)
            radius = random.uniform(*TIGHT_RADIUS_RANGE)
            bank = math.radians(random.uniform(*TIGHT_BANK_ANGLE_RANGE))
        # Randomly choose left or right turn
        turn_dir = random.choice([-1.0, 1.0])
        angle = math.radians(angle_deg) * turn_dir
        # Arc length
        arc_length = abs(radius * angle)
        # Number of samples for this arc
        steps = max(4, int(abs(angle_deg) / SAMPLE_PER_CURVE_DEG))
        dtheta = angle / steps
        # Compute arc starting center: move perpendicular to heading by radius
        perp = Vector((-head.y, head.x)) * turn_dir
        arc_center = pos + perp * radius
        # compute points along arc from start angle
        # start angle in polar coords
        for s in range(1, steps + 1):
            theta = math.atan2((pos - arc_center).y, (pos - arc_center).x) + dtheta * s
            p = arc_center + Vector((math.cos(theta) * radius, math.sin(theta) * radius))
            center_pts.append(Vector((p.x, p.y, 0.0)))
        # update pos and head to end of arc
        pos = Vector((center_pts[-1].x, center_pts[-1].y))
        # rotate head by angle
        head = rotation_2d(head, angle)

# Close loop: compute closure error and distribute correction
first = center_pts[0]
last = center_pts[-1]
closure = last - first
n = len(center_pts)
for i, p in enumerate(center_pts):
    factor = i / (n - 1)
    center_pts[i] = Vector((p.x - closure.x * factor, p.y - closure.y * factor, 0.0))

# Smooth the centerline using simple Chaikin subdivision to reduce sharp corners
def chaikin(points, iterations=2):
    for _ in range(iterations):
        new = []
        m = len(points)
        for i in range(m):
            p0 = points[i]
            p1 = points[(i + 1) % m]
            q = p0 * 0.75 + p1 * 0.25
            r = p0 * 0.25 + p1 * 0.75
            new.append(q)
            new.append(r)
        points = new
    return points

centerline = chaikin(center_pts, iterations=3)
# make sure it's closed by repeating first at end for sampling ease
if (centerline[0] - centerline[-1]).length > 1e-5:
    centerline.append(centerline[0].copy())

# compute cumulative distances
cumdist = [0.0]
for i in range(1, len(centerline)):
    cumdist.append(cumdist[-1] + (centerline[i] - centerline[i-1]).length)
total_length = cumdist[-1]

# Create a Curve object from centerline
curve_data = bpy.data.curves.new('Centerline', type='CURVE')
curve_data.dimensions = '3D'
curve_data.resolution_u = 12
spline = curve_data.splines.new('POLY')
spline.points.add(len(centerline)-1)
for i, pt in enumerate(centerline):
    spline.points[i].co = (pt.x, pt.y, pt.z, 1.0)
spline.use_cyclic_u = True
curve_obj = bpy.data.objects.new('Centerline_Curve', curve_data)
main_col.objects.link(curve_obj)

# Create rectangular profile curve for bevel (road width)
profile_curve = bpy.data.curves.new('RoadProfile', type='CURVE')
profile_curve.dimensions = '2D'
profile_spline = profile_curve.splines.new('POLY')
# rectangle centered on origin in X (width) and Y (thickness)
hw = TRACK_WIDTH / 2.0
ht = ROAD_PROFILE_THICKNESS
profile_pts = [(-hw, -ht, 0.0), (hw, -ht, 0.0), (hw, ht, 0.0), (-hw, ht, 0.0)]
profile_spline.points.add(len(profile_pts)-1)
for i, p in enumerate(profile_pts):
    x,y,z = p
    profile_spline.points[i].co = (x, y, z, 1.0)
profile_spline.use_cyclic_u = True
profile_obj = bpy.data.objects.new('Road_Profile', profile_curve)
main_col.objects.link(profile_obj)

# Position profile so its local Y aligns with curve width direction: rotate 90 deg
profile_obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)

# Assign bevel object
curve_data.bevel_object = profile_obj
curve_data.fill_mode = 'FULL'

# Convert the beveled curve to mesh for the visual road
bpy.context.view_layer.objects.active = curve_obj
curve_obj.select_set(True)
profile_obj.select_set(True)
# Convert (bevel) -> mesh
bpy.ops.object.convert(target='MESH')
road_obj = bpy.context.view_layer.objects.active
road_obj.name = 'Track_Road'
# Move profile out of the way and remove it
if profile_obj.name in bpy.data.objects:
    bpy.data.objects.remove(profile_obj, do_unlink=True)

# Ensure object is in our collection
if road_obj.name not in main_col.objects:
    main_col.objects.link(road_obj)

# Create UVs for the road: project along centerline
mesh = road_obj.data
# Ensure we have vertex normals and loops
mesh.calc_loop_triangles()
# Create UV map
if not mesh.uv_layers:
    uv_layer = mesh.uv_layers.new(name='UVMap')
else:
    uv_layer = mesh.uv_layers.active

# Helper: sample nearest centerline projection for a given 3D point
def project_to_centerline(p):
    # p is Vector in object local coordinates
    best_d = 1e9
    best_v = 0.0
    # search through centerline segments
    for i in range(len(centerline)-1):
        a = Vector((centerline[i].x, centerline[i].y, centerline[i].z))
        b = Vector((centerline[i+1].x, centerline[i+1].y, centerline[i+1].z))
        ab = b - a
        if ab.length_squared == 0.0:
            continue
        t = max(0.0, min(1.0, (Vector((p.x,p.y,0.0)) - a).dot(ab) / ab.dot(ab)))
        proj = a + ab * t
        d = (Vector((p.x,p.y,0.0)) - proj).length
        if d < best_d:
            best_d = d
            best_v = cumdist[i] + (ab.length * t)
            # also record lateral sign
    return best_v / max(1e-6, total_length)

# Assign UVs: U across width, V along length
# Need local coordinate approximation: find tangent of centerline near projection to compute lateral axis
# For simplicity, derive U from vertex local X relative to road origin bounding box
bbox_min = Vector((min(v.co.x for v in mesh.vertices), min(v.co.y for v in mesh.vertices), min(v.co.z for v in mesh.vertices)))
bbox_max = Vector((max(v.co.x for v in mesh.vertices), max(v.co.y for v in mesh.vertices), max(v.co.z for v in mesh.vertices)))
width_span = bbox_max.x - bbox_min.x if (bbox_max.x - bbox_min.x) != 0 else TRACK_WIDTH

# Map each loop's vertex to UV
for loop in mesh.loops:
    v = mesh.vertices[loop.vertex_index]
    co = road_obj.matrix_world @ v.co
    # project onto XY plane
    p_local = road_obj.matrix_world.inverted() @ co
    u = (p_local.x - bbox_min.x) / width_span
    vcoord = project_to_centerline(p_local)
    uv_layer.data[loop.index].uv = (u, vcoord)

# Recalculate normals outward/up
mesh.calc_normals()

# Create walls (inner + outer) as single mesh following road edge
# We'll derive left/right edge samples by offsetting centerline tangents
edge_points_left = []
edge_points_right = []
for i in range(len(centerline)-1):
    a = centerline[i]
    b = centerline[i+1]
    tangent = (b - a).to_2d().normalized()
    normal = Vector((-tangent.y, tangent.x))
    left = Vector((a.x, a.y, 0.0)) + normal * (TRACK_WIDTH / 2.0)
    right = Vector((a.x, a.y, 0.0)) - normal * (TRACK_WIDTH / 2.0)
    edge_points_left.append(left)
    edge_points_right.append(right)
# Duplicate last point to close
edge_points_left.append(edge_points_left[0])
edge_points_right.append(edge_points_right[0])

# Build wall mesh: for each side, create vertical quads between samples
wall_mesh = bpy.data.meshes.new('walls_mesh')
wall_obj = bpy.data.objects.new('Track_Walls', wall_mesh)
main_col.objects.link(wall_obj)

bm = bmesh.new()
verts_left_bottom = []
verts_left_top = []
verts_right_bottom = []
verts_right_top = []
for p in edge_points_left:
    vb = bm.verts.new((p.x, p.y, 0.0))
    vt = bm.verts.new((p.x, p.y, WALL_HEIGHT))
    verts_left_bottom.append(vb)
    verts_left_top.append(vt)
for p in edge_points_right:
    vb = bm.verts.new((p.x, p.y, 0.0))
    vt = bm.verts.new((p.x, p.y, WALL_HEIGHT))
    verts_right_bottom.append(vb)
    verts_right_top.append(vt)
# create faces between subsequent verts
m = len(verts_left_bottom)
for i in range(m-1):
    # left wall quad
    bm.faces.new((verts_left_bottom[i], verts_left_bottom[i+1], verts_left_top[i+1], verts_left_top[i]))
    # right wall quad
    bm.faces.new((verts_right_bottom[i+1], verts_right_bottom[i], verts_right_top[i], verts_right_top[i+1]))
# Optionally create top caps/rail
# create face connecting left top to right top across track ends for small closure
bm.to_mesh(wall_mesh)
bm.free()

# Flip normals if needed and compute normals
wall_mesh.calc_normals()

# Create start/finish line mesh (strip across track at a sampled position)
sf_pos_idx = int(len(centerline) * 0.05)  # near start
p0 = centerline[sf_pos_idx]
p1 = centerline[sf_pos_idx+1]
heading = (p1 - p0).to_2d().normalized()
perp = Vector((-heading.y, heading.x))
# create a thin plane across track width
line_width = TRACK_WIDTH + 1.0
line_length = 4.0
center = Vector((p0.x, p0.y, 0.01))
# create stripe geometry subdivided across width into 10 stripes for alternating colors
stripes = 10
stripe_w = line_width / stripes
verts = []
faces = []
for i in range(stripes+1):
    offset = -line_width/2.0 + i*stripe_w
    c = center + Vector((perp.x*offset, perp.y*offset, 0.0))
    v1 = (c.x - heading.x*line_length/2.0, c.y - heading.y*line_length/2.0, c.z)
    v2 = (c.x + heading.x*line_length/2.0, c.y + heading.y*line_length/2.0, c.z)
    verts.append(v1)
    verts.append(v2)
for i in range(stripes):
    a = i*2
    faces.append((a, a+2, a+3, a+1))

mesh_sf = bpy.data.meshes.new('sf_mesh')
obj_sf = bpy.data.objects.new('StartFinish_Line', mesh_sf)
main_col.objects.link(obj_sf)
mesh_sf.from_pydata(verts, [], faces)
mesh_sf.update()
# assign alternating materials
mat_white = bpy.data.materials.new('SF_White')
mat_white.diffuse_color = (1.0, 1.0, 1.0, 1.0)
mat_black = bpy.data.materials.new('SF_Black')
mat_black.diffuse_color = (0.02, 0.02, 0.02, 1.0)
obj_sf.data.materials.append(mat_white)
obj_sf.data.materials.append(mat_black)
# assign by face
for i, f in enumerate(obj_sf.data.polygons):
    f.material_index = 0 if (i % 2 == 0) else 1

# Create a simple flat grid area near the line
grid_w = 30.0
grid_l = 40.0
grid_center = center - heading * (grid_l/2.0 + 2.0)
verts = [
    (grid_center.x - perp.x*grid_w/2.0 - heading.x*grid_l/2.0, grid_center.y - perp.y*grid_w/2.0 - heading.y*grid_l/2.0, 0.0),
    (grid_center.x + perp.x*grid_w/2.0 - heading.x*grid_l/2.0, grid_center.y + perp.y*grid_w/2.0 - heading.y*grid_l/2.0, 0.0),
    (grid_center.x + perp.x*grid_w/2.0 + heading.x*grid_l/2.0, grid_center.y + perp.y*grid_w/2.0 + heading.y*grid_l/2.0, 0.0),
    (grid_center.x - perp.x*grid_w/2.0 + heading.x*grid_l/2.0, grid_center.y - perp.y*grid_w/2.0 + heading.y*grid_l/2.0, 0.0),
]
mesh_grid = bpy.data.meshes.new('grid_mesh')
obj_grid = bpy.data.objects.new('Start_Grid', mesh_grid)
main_col.objects.link(obj_grid)
mesh_grid.from_pydata(verts, [], [(0,1,2,3)])
mesh_grid.update()
mat_grid = bpy.data.materials.new('Grid_Mat')
mat_grid.diffuse_color = (0.1, 0.1, 0.12, 1.0)
obj_grid.data.materials.append(mat_grid)

# Parent start/finish and grid under walls object for tidiness
obj_sf.parent = wall_obj
obj_grid.parent = wall_obj

# Scatter simple low-poly props beyond walls
props_parent = bpy.data.objects.new('Track_Props', None)
main_col.objects.link(props_parent)
# Create some primitive low-poly prototypes
# Tree (cone + cylinder)
def make_tree(location, scale=1.0):
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.8*scale, depth=2.5*scale, location=(location.x, location.y, 1.0*scale))
    cone = bpy.context.active_object
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.2*scale, depth=1.0*scale, location=(location.x, location.y, 0.5*scale))
    trunk = bpy.context.active_object
    tree = bpy.data.objects.new('Tree', None)
    # join cone and trunk
    ctx = bpy.context.copy()
    ctx['active_object'] = cone
    cone.select_set(True)
    trunk.select_set(True)
    bpy.ops.object.join(ctx)
    obj = bpy.context.active_object
    obj.name = 'Prop_Tree'
    obj.parent = props_parent
    obj.scale *= scale
    return obj

# Light pole
def make_pole(location, height=6.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.08, depth=height, location=(location.x, location.y, height/2.0))
    pole = bpy.context.active_object
    pole.name = 'Prop_Pole'
    pole.parent = props_parent
    return pole

# Box
def make_box(location, size=1.0):
    bpy.ops.mesh.primitive_cube_add(size=size, location=(location.x, location.y, size/2.0))
    box = bpy.context.active_object
    box.name = 'Prop_Box'
    box.parent = props_parent
    return box

# scatter along track using PROP_DENSITY
prop_count = max(6, int(total_length * PROP_DENSITY))
for i in range(prop_count):
    t = random.random() * total_length
    # find segment
    idx = 0
    while idx < len(cumdist)-1 and cumdist[idx+1] < t:
        idx += 1
    seg_t = (t - cumdist[idx]) / max(1e-6, (cumdist[idx+1] - cumdist[idx]))
    p_a = centerline[idx]
    p_b = centerline[min(idx+1, len(centerline)-1)]
    p = p_a.lerp(p_b, seg_t)
    # compute heading and perp
    tangent = (p_b - p_a).to_2d()
    if tangent.length == 0:
        tangent = Vector((1.0, 0.0))
    else:
        tangent = tangent.normalized()
    perp = Vector((-tangent.y, tangent.x))
    # pick side and distance
    side = random.choice([-1, 1])
    offset = random.uniform(PROP_OFFSET_MIN, PROP_OFFSET_MAX) * side
    loc = Vector((p.x + perp.x * offset, p.y + perp.y * offset, 0.0))
    typ = random.choice(['tree','pole','box'])
    if typ == 'tree':
        make_tree(loc, scale=random.uniform(0.6, 1.6))
    elif typ == 'pole':
        make_pole(loc, height=random.uniform(4.0, 10.0))
    else:
        make_box(loc, size=random.uniform(0.6, 2.0))

# Create simplified collider by sampling fewer points and generating ribbon
col_samples = []
step = max(2, int(1.0 / max(1e-6, COLLIDER_DENSITY)))
for i in range(0, len(centerline)-1, step):
    col_samples.append(centerline[i])
# ensure closed
if (col_samples[0] - col_samples[-1]).length > 1e-5:
    col_samples.append(col_samples[0].copy())

# build collider mesh vertices (left/right) and faces
verts = []
faces = []
for p in col_samples:
    # compute tangent for this sample
    # find next
    i = centerline.index(p) if p in centerline else 0
    p_next = centerline[(i+1)%len(centerline)]
    tangent = (p_next - p).to_2d()
    if tangent.length == 0:
        tangent = Vector((1.0,0.0))
    else:
        tangent = tangent.normalized()
    perp = Vector((-tangent.y, tangent.x))
    left = Vector((p.x + perp.x*(TRACK_WIDTH/2.0), p.y + perp.y*(TRACK_WIDTH/2.0), 0.0))
    right = Vector((p.x - perp.x*(TRACK_WIDTH/2.0), p.y - perp.y*(TRACK_WIDTH/2.0), 0.0))
    verts.append((left.x, left.y, left.z))
    verts.append((right.x, right.y, right.z))
# faces between pairs
for i in range(0, len(verts)-2, 2):
    faces.append((i, i+1, i+3, i+2))

mesh_col = bpy.data.meshes.new('collider_mesh')
mesh_col.from_pydata(verts, [], faces)
mesh_col.update()
col_obj = bpy.data.objects.new('Track_Collider', mesh_col)
main_col.objects.link(col_obj)
# Make collider non-renderable and set display bounds
col_obj.display_type = 'WIRE'
col_obj.hide_render = True

# Parent and organize
road_obj.parent = None
wall_obj.parent = None
props_parent.parent = None
col_obj.parent = None

# Add basic materials for road and walls
mat_road = bpy.data.materials.new('Road_Mat')
mat_road.use_nodes = True
bsdf = mat_road.node_tree.nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.06, 0.06, 0.06, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9
road_obj.data.materials.append(mat_road)

mat_wall = bpy.data.materials.new('Wall_Mat')
mat_wall.use_nodes = True
bsdf = mat_wall.node_tree.nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.2, 0.2, 0.22, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.8
wall_obj.data.materials.append(mat_wall)

# Move camera and lights to sensible positions
cam = bpy.data.cameras.new('Camera')
cam_obj = bpy.data.objects.new('Camera', cam)
cam_obj.location = (0.0, -total_length/6.0, total_length/10.0)
cam_obj.rotation_euler = (math.radians(65.0), 0.0, 0.0)
main_col.objects.link(cam_obj)
scene.camera = cam_obj

light_data = bpy.data.lights.new(name='Sun', type='SUN')
light_obj = bpy.data.objects.new(name='Sun', object_data=light_data)
light_obj.rotation_euler = (math.radians(50.0), math.radians(0.0), math.radians(30.0))
main_col.objects.link(light_obj)

print('Procedural racetrack generated:')
print('  Track length (approx): {:.1f} m'.format(total_length))
print('  Road object: Track_Road')
print('  Walls object: Track_Walls')
print('  Props parent: Track_Props')
print('  Collider: Track_Collider')
print('Adjust parameters at the top of the script as needed.')
