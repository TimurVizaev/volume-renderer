var ToolsDefaultOptions = function ()
{
    this.ShowOrientationCube = true,
    this.ShowFlowChart = false,

    this.ImageUseCustomSize = false,
    this.ImageWidth = '800',
    this.ImageHeight = '600',
    this.ImageTransparent = false,
    this.VideoFramerate = '24',
    this.VideoDuration = 2,
    this.VideoFormat = 'webm',
    this.VideoUseCustomSize = false,
    this.VideoWidth = '800',
    this.VideoHeight = '600',
    this.VideoTotalFrames = 60
};

var ViewDefaultOptions = function ()
{
    this.LoadMagnitudes = function () { window.LoadArgument = LoadArgumentType.Magnitude; document.getElementById('fileInput').click(); }
    this.LoadVelocities = function () { window.LoadArgument = LoadArgumentType.Velocity; document.getElementById('fileInput').click(); }
    this.Color1 = '#2e4c66',
    this.Color2 = '#14212c',
    this.GradientStyle = 'to right'
};

var RenderDefaultOptions = function ()
{
    this.ColorRange1 = 0.1,
        this.ColorRange2 = 1.0,
        this.ISOThreshold = 0.25,
        this.MIPColorMap = 'Viridis',
        this.ISOColorMap = 'Gray',
        this.SpeedColorMap = 'Viridis',
        this.interpolateFrame = true,
        this.animate = false,
        this.isvisible = true,
        this.speed = 1.0,
        this.rotate = false,
        this.rotationSpeed = 0.1,
        this.XRangeStart = 0.0,
        this.XRangeEnd = 1.0,
        this.YRangeStart = 0.0,
        this.YRangeEnd = 1.0,
        this.ZRangeStart = 0.0,
        this.ZRangeEnd = 0.95,
        this.IsSpeedOverlayEnabled = false
    this.MIPContribution = 1.0,
        this.ISOContribution = 0.0,
        this.SpeedContribution = 1.0,
    this.AreaOfInterestAccentuator = 0.0,
        this.ShowAreaOfInterest = false,
        this.AreaOfInterestRadius = 0.3,
        this.ResolutionFactor = 1.0
};

var Render = new RenderDefaultOptions();
var View = new ViewDefaultOptions();
var Tools = new ToolsDefaultOptions();

var LoadArgumentType =
{
	Magnitude: 0,
	Velocity: 1
}

export { Render }
export { View }
export { Tools }
export { LoadArgumentType }