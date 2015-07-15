ng.module('smart-table')
  .directive('stResetFilter', ['$parse', function ($parse) {
        return {
            restrict: 'A',
            require: '^stTable',
            link: function (scope, element, attr, ctrl) {
                var tableCtrl = ctrl;
                var fn = $parse(attr['stResetFilter']);

                element.on('click', function (event) {
                    ctrl.tableState().search = {};
                    tableCtrl.search('', '');
                    scope.$apply(function () {
                        fn(scope, {
                            $event: event
                        })
                    });
                });
            }
        };
  }]);