/*jshint node:true, mocha:true*/

'use strict';
var testFixture = require('../../globals');

describe('ExecuteJob', function () {
    var gmeConfig = testFixture.getGmeConfig(),
        expect = testFixture.expect,
        logger = testFixture.logger.fork('ExecuteJob'),
        PluginCliManager = testFixture.WebGME.PluginCliManager,
        projectName = 'testProject',
        pluginName = 'ExecuteJob',
        manager = new PluginCliManager(null, logger, gmeConfig),
        project,
        gmeAuth,
        storage,
        commitHash;

    before(function (done) {
        this.timeout(10000);
        testFixture.clearDBAndGetGMEAuth(gmeConfig, projectName)
            .then(function (gmeAuth_) {
                gmeAuth = gmeAuth_;
                // This uses in memory storage. Use testFixture.getMongoStorage to persist test to database.
                storage = testFixture.getMemoryStorage(logger, gmeConfig, gmeAuth);
                return storage.openDatabase();
            })
            .then(function () {
                var importParam = {
                    projectSeed: testFixture.path.join(testFixture.DF_SEED_DIR, 'devProject', 'devProject.webgmex'),
                    projectName: projectName,
                    branchName: 'master',
                    logger: logger,
                    gmeConfig: gmeConfig
                };

                return testFixture.importProject(storage, importParam);
            })
            .then(function (importResult) {
                project = importResult.project;
                commitHash = importResult.commitHash;
                return project.createBranch('test', commitHash);
            })
            .nodeify(done);
    });

    after(function (done) {
        storage.closeDatabase()
            .then(function () {
                return gmeAuth.unload();
            })
            .nodeify(done);
    });

    it('should verify activeNode is "Job"', function (done) {
        var pluginConfig = {},
            context = {
                project: project,
                commitHash: commitHash,
                branchName: 'test',
                activeNode: '/1'
            };

        manager.executePlugin(pluginName, pluginConfig, context, function (err, pluginResult) {
            expect(err).to.equal('Cannot execute FCO (expected Job)');
            expect(typeof pluginResult).to.equal('object');
            expect(pluginResult.success).to.equal(false);
            done();
        });
    });

    // Race condition checks w/ saving...
    it('should get correct attribute while applying node changes', function(done) {
        var plugin,
            nodeId = '/K/R/p',
            context = {
                project: project,
                commitHash: commitHash,
                branchName: 'test',
                activeNode: '/K/R'
            };

        manager.initializePlugin(pluginName)
            .then(plugin_ => {
                plugin = plugin_;
                return manager.configurePlugin(plugin, {}, context);
            })
            .then(() => {
                return plugin.core.loadByPath(plugin.rootNode, nodeId);
            })
            .then(node => {
                // Run setAttribute on some node
                plugin.setAttribute(node, 'status', 'queued');

                // Check that the value is correct before applying node changes
                var oldApplyChanges = plugin._applyNodeChanges;
                plugin._applyNodeChanges = function() {
                    var attrValue = plugin.getAttribute(node, 'status');
                    expect(attrValue).to.equal('queued');
                    return oldApplyChanges.apply(this, arguments);
                };
                return plugin.save();
            })
            .nodeify(done);
    });
});
