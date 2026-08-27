$._CVS_ = {
  quote: function (value) {
    return '"' + String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
  },
  result: function (ok, data, message) {
    return '{"ok":' + (ok ? 'true' : 'false') + ',"data":' + (data || 'null') + ',"message":' + this.quote(message || '') + '}';
  },
  findBin: function (name) {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i += 1) {
      var child = root.children[i];
      if (child && child.type === ProjectItemType.BIN && child.name === name) return child;
    }
    return root.createBin(name);
  },
  findByPath: function (container, mediaPath) {
    if (!container || !container.children) return null;
    var normalized = String(mediaPath).toLowerCase().replace(/\\/g, '/');
    for (var i = 0; i < container.children.numItems; i += 1) {
      var child = container.children[i];
      try {
        if (child.getMediaPath && String(child.getMediaPath()).toLowerCase().replace(/\\/g, '/') === normalized) return child;
      } catch (_) {}
      if (child.type === ProjectItemType.BIN) {
        var found = this.findByPath(child, mediaPath);
        if (found) return found;
      }
    }
    return null;
  },
  sequenceEnd: function (sequence) {
    var seconds = 0;
    var tracks = [sequence.videoTracks, sequence.audioTracks];
    for (var t = 0; t < tracks.length; t += 1) {
      for (var i = 0; i < tracks[t].numTracks; i += 1) {
        var clips = tracks[t][i].clips;
        for (var c = 0; c < clips.numItems; c += 1) seconds = Math.max(seconds, clips[c].end.seconds);
      }
    }
    var time = new Time();
    time.seconds = seconds;
    return time;
  },
  importMedia: function (json) {
    try {
      var options = JSON.parse(json);
      if (!app.project) return this.result(false, null, 'Premiere 프로젝트를 먼저 열어 주세요.');
      var bin = this.findBin(options.binName || '00 클린 비디오');
      var imported = app.project.importFiles([options.path], true, bin, false);
      if (!imported) return this.result(false, null, '파일을 프로젝트로 가져오지 못했습니다.');
      var item = this.findByPath(bin, options.path);
      if (!item) return this.result(false, null, '가져온 프로젝트 항목을 찾지 못했습니다.');
      if (options.target === 'timeline') {
        var sequence = app.project.activeSequence;
        if (!sequence) return this.result(false, null, '활성 시퀀스를 열어 주세요. 파일은 프로젝트에는 추가했습니다.');
        var time = options.position === 'end' ? this.sequenceEnd(sequence) : sequence.getPlayerPosition();
        sequence.insertClip(item, time, Number(options.videoTrack || 0), Number(options.audioTrack || 0));
      }
      return this.result(true, this.quote(item.name), options.target === 'timeline' ? '프로젝트와 타임라인에 추가했습니다.' : '프로젝트에 추가했습니다.');
    } catch (error) { return this.result(false, null, error.message || String(error)); }
  },
  getProjectContext: function () {
    try {
      if (!app.project) return this.result(false, null, 'Premiere 프로젝트를 먼저 열어 주세요.');
      var data = '{"projectPath":' + this.quote(app.project.path || '') + ',"sequence":' + this.quote(app.project.activeSequence ? app.project.activeSequence.name : '') + '}';
      return this.result(true, data, '');
    } catch (error) { return this.result(false, null, error.message || String(error)); }
  },
  exportCurrentFrame: function (outputPath) {
    try {
      var sequence = app.project && app.project.activeSequence;
      if (!sequence) return this.result(false, null, '활성 시퀀스를 열어 주세요.');
      var pngPath = String(outputPath).replace(/\.[^.]+$/, '') + '.png';
      var ok = sequence.exportFramePNG(sequence.getPlayerPosition(), pngPath);
      return ok ? this.result(true, this.quote(pngPath), '현재 프레임을 저장했습니다.') : this.result(false, null, '현재 프레임을 내보내지 못했습니다.');
    } catch (error) { return this.result(false, null, error.message || String(error)); }
  }
};
